param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$resultCode = 1
$dialog = $null
$child = $null
$writeMayHaveOccurred = $false

try {
    $helper = Join-Path $PSScriptRoot 'configure-google-play-credential.mjs'
    if (-not (Test-Path -LiteralPath $helper -PathType Leaf) -or $helper -match '["\r\n]') {
        throw 'The local credential helper is unavailable.'
    }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $selectedPath = $null
    if ($Apply) {
        if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
            throw 'Run this helper with powershell.exe -NoProfile -STA -File.'
        }
        Write-Host 'Select the downloaded JSON for solace-play-billing@ennearock-web.iam.gserviceaccount.com.'
        Write-Host 'The helper verifies the Google catalog and adds one server-only Vercel secret. Purchases remain disabled.'
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = 'Select Solace Google service-account JSON (kept private)'
        $dialog.Filter = 'Google service-account JSON (*.json)|*.json'
        $dialog.Multiselect = $false
        $dialog.CheckFileExists = $true
        $dialog.CheckPathExists = $true
        $dialog.RestoreDirectory = $true
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            Write-Output '{"ok":false,"code":"CANCELLED","writeAttempted":false}'
            exit 2
        }
        $selectedPath = $dialog.FileName
        $mode = '--apply'
    } else {
        $mode = '--preview'
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodePath
    $startInfo.Arguments = '"' + $helper + '" ' + $mode
    $startInfo.WorkingDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = $startInfo
    if (-not $child.Start()) { throw 'The local helper could not start.' }
    $writeMayHaveOccurred = [bool]$Apply
    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()
    if ($Apply) {
        $selection = @{ credentialPath = $selectedPath } | ConvertTo-Json -Compress
        # Windows PowerShell 5.1 has no StandardInputEncoding property. Write
        # the JSON path selection as explicit UTF-8, including Unicode names.
        $selectionBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($selection)
        $child.StandardInput.BaseStream.Write($selectionBytes, 0, $selectionBytes.Length)
        $child.StandardInput.BaseStream.Flush()
        [Array]::Clear($selectionBytes, 0, $selectionBytes.Length)
        $selectionBytes = $null
        $selection = $null
        $selectedPath = $null
    }
    $child.StandardInput.Close()
    $child.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $null = $stderrTask.GetAwaiter().GetResult()
    # Print only the helper's structured public result. Raw provider diagnostics
    # and the selected file's contents/path never reach this terminal.
    $result = $stdout | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $result.ok) { throw 'Invalid helper response.' }
    Write-Output ($result | ConvertTo-Json -Depth 8)
    $resultCode = $child.ExitCode
} catch {
    $attempted = if ($writeMayHaveOccurred) { 'null' } else { 'false' }
    Write-Output ('{"ok":false,"code":"LOCAL_SETUP_FAILED","message":"The local credential helper could not finish. No credential details were printed.","writeAttempted":' + $attempted + '}')
} finally {
    if ($dialog) { $dialog.Dispose() }
    if ($child) { $child.Dispose() }
}

exit $resultCode
