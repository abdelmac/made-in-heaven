param(
  [ValidateSet('Create', 'Build', 'Backup', 'Check')][string]$Action = 'Build',
  [ValidateRange(1, 2100000000)][int]$VersionCode = 1,
  [ValidatePattern('^[0-9]+\.[0-9]+(\.[0-9]+)?([-+][A-Za-z0-9.-]+)?$')][string]$VersionName = '1.0.0',
  [string]$BackupPath,
  [switch]$StoreBilling,
  [switch]$Apk,
  [switch]$SkipSync
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'This wrapper requires Windows current-user DPAPI. Use an existing upload keystore on other systems.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$signingRoot = Join-Path $projectRoot '.local/signing'
$keystorePath = Join-Path $signingRoot 'solace-upload.p12'
$protectedPath = Join-Path $signingRoot 'upload-password.dpapi'
$certificatePath = Join-Path $signingRoot 'solace-upload-certificate.pem'
$reservationPath = Join-Path $signingRoot 'upload-identity.reserved'
$uploadAlias = 'solace-upload'
foreach ($directory in @((Join-Path $projectRoot '.local'), $signingRoot)) {
  if ((Test-Path -LiteralPath $directory) -and ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Signing directories must be local project directories, not symbolic links or junctions.'
  }
}

function Set-PrivateAcl([string]$Path) {
  $item = Get-Item -LiteralPath $Path
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  if ($item.PSIsContainer) {
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    $propagation = [Security.AccessControl.PropagationFlags]::None
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance, $propagation, 'Allow')))
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($system, 'FullControl', $inheritance, $propagation, 'Allow')))
  } else {
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($system, 'FullControl', 'Allow')))
  }
  $acl.SetOwner($identity)
  $acl.SetAccessRuleProtection($true, $false)
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function Get-Plaintext([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Invoke-Keytool([string[]]$Arguments) {
  & $script:keytool @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Upload-key operation failed. Existing signing files were preserved for review.' }
}

Push-Location $projectRoot
try {
  $toolJson = & node --input-type=module -e "import {findAndroidTools} from './scripts/check-mobile.mjs'; const t=findAndroidTools(); console.log(JSON.stringify({javaHome:t.javaHome}));"
  if ($LASTEXITCODE -ne 0) { throw 'Could not discover the local JDK.' }
} finally { Pop-Location }
$javaHomeForRelease = ($toolJson | ConvertFrom-Json).javaHome
if (-not $javaHomeForRelease) { throw 'A discoverable JDK 21+ is required.' }
$script:keytool = Join-Path $javaHomeForRelease 'bin/keytool.exe'
if (-not (Test-Path -LiteralPath $script:keytool -PathType Leaf)) { throw 'JDK keytool is unavailable.' }

try {
  if ($Action -eq 'Create') {
    foreach ($path in @($keystorePath, $protectedPath, $certificatePath, $reservationPath)) {
      if (Test-Path -LiteralPath $path) { throw 'An upload identity or reservation already exists. Creation refuses to replace or rotate it.' }
    }
    $random = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($random) } finally { $generator.Dispose() }
    $env:SOLACE_ANDROID_STORE_PASSWORD = [Convert]::ToBase64String($random)
    [Array]::Clear($random, 0, $random.Length)
    $secret = ConvertTo-SecureString $env:SOLACE_ANDROID_STORE_PASSWORD -AsPlainText -Force
    try { $protected = ConvertFrom-SecureString $secret } finally { $secret.Dispose() }
    # Prove DPAPI works before reserving or creating any identity files.
    New-Item -ItemType Directory -Path $signingRoot -Force | Out-Null
    Set-PrivateAcl $signingRoot
    $reservation = [IO.File]::Open($reservationPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $reservation.Dispose()
    # DPAPI ciphertext is bound to this Windows user; no plaintext password file.
    [IO.File]::WriteAllText($protectedPath, $protected, [Text.Encoding]::ASCII)
    Set-PrivateAcl $protectedPath
    $protected = $null
    Invoke-Keytool -Arguments @('-genkeypair', '-keystore', $keystorePath, '-storetype', 'PKCS12', '-alias', $uploadAlias, '-keyalg', 'RSA', '-keysize', '4096', '-sigalg', 'SHA256withRSA', '-validity', '10000', '-dname', 'CN=Solace Upload,C=FR', '-storepass:env', 'SOLACE_ANDROID_STORE_PASSWORD', '-keypass:env', 'SOLACE_ANDROID_STORE_PASSWORD', '-noprompt')
    Set-PrivateAcl $keystorePath
    Invoke-Keytool -Arguments @('-exportcert', '-rfc', '-keystore', $keystorePath, '-storetype', 'PKCS12', '-alias', $uploadAlias, '-storepass:env', 'SOLACE_ANDROID_STORE_PASSWORD', '-file', $certificatePath)
    Set-PrivateAcl $certificatePath
    Write-Output 'New upload identity created with RSA4096. The private key and DPAPI-protected password remain local and ignored.'
    Write-Output 'Create an owner-password-encrypted portable backup before relying on this identity for store updates.'
    return
  }
  if (-not (Test-Path -LiteralPath $keystorePath -PathType Leaf) -or -not (Test-Path -LiteralPath $protectedPath -PathType Leaf)) {
    throw 'No complete local upload identity exists. Create it explicitly with -Action Create; existing files are never replaced.'
  }
  $protectedSecret = Get-Content -LiteralPath $protectedPath -Raw | ConvertTo-SecureString
  try { $env:SOLACE_ANDROID_STORE_PASSWORD = Get-Plaintext $protectedSecret } finally { $protectedSecret.Dispose() }
  $env:SOLACE_ANDROID_STORE_FILE = $keystorePath
  $env:SOLACE_ANDROID_KEY_ALIAS = $uploadAlias
  $env:SOLACE_ANDROID_KEY_PASSWORD = $env:SOLACE_ANDROID_STORE_PASSWORD
  if ($Action -eq 'Check') {
    Invoke-Keytool -Arguments @('-list', '-v', '-keystore', $keystorePath, '-storetype', 'PKCS12', '-alias', $uploadAlias, '-storepass:env', 'SOLACE_ANDROID_STORE_PASSWORD')
    Write-Output 'Existing upload identity decrypted and inspected successfully; no private key or password was exported.'
    return
  }
  if ($Action -eq 'Backup') {
    if (-not $BackupPath) { throw 'Provide -BackupPath to an owner-controlled encrypted backup location.' }
    $target = [IO.Path]::GetFullPath($BackupPath)
    if ((Test-Path -LiteralPath $target) -or $target -eq $keystorePath) { throw 'Backup destination already exists. It will not be overwritten.' }
    $backupDirectory = [IO.Path]::GetDirectoryName($target)
    if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) { throw 'Choose an existing owner-controlled backup directory.' }
    $first = Read-Host 'Portable backup password (at least 16 characters; save it in your password manager)' -AsSecureString
    $second = Read-Host 'Confirm portable backup password' -AsSecureString
    try {
      $env:SOLACE_ANDROID_BACKUP_PASSWORD = Get-Plaintext $first
      $confirmation = Get-Plaintext $second
      if ($env:SOLACE_ANDROID_BACKUP_PASSWORD.Length -lt 16 -or $env:SOLACE_ANDROID_BACKUP_PASSWORD -cne $confirmation) { throw 'Backup passwords must match and contain at least 16 characters.' }
      $confirmation = $null
      # Re-encrypt the same key pair to the owner's portable password. This does
      # not generate or rotate an identity; passwords remain child-environment only.
      Invoke-Keytool -Arguments @('-importkeystore', '-srckeystore', $keystorePath, '-srcstoretype', 'PKCS12', '-srcstorepass:env', 'SOLACE_ANDROID_STORE_PASSWORD', '-srcalias', $uploadAlias, '-destkeystore', $target, '-deststoretype', 'PKCS12', '-deststorepass:env', 'SOLACE_ANDROID_BACKUP_PASSWORD', '-destkeypass:env', 'SOLACE_ANDROID_BACKUP_PASSWORD', '-destalias', $uploadAlias, '-noprompt')
      Set-PrivateAcl $target
      Invoke-Keytool -Arguments @('-list', '-keystore', $target, '-storetype', 'PKCS12', '-alias', $uploadAlias, '-storepass:env', 'SOLACE_ANDROID_BACKUP_PASSWORD')
      Write-Output 'Portable encrypted backup created. Keep it separately from this computer and store its password in your password manager.'
    } finally { $first.Dispose(); $second.Dispose(); $confirmation = $null }
    return
  }
  $buildArguments = @('scripts/build-android-release.mjs', '--signed', '--version-code', [string]$VersionCode, '--version-name', $VersionName)
  if ($SkipSync) { $buildArguments += '--skip-sync' }
  if ($StoreBilling) { $buildArguments += '--store-billing' }
  if ($Apk) { $buildArguments += '--apk' }
  Push-Location $projectRoot
  try {
    & node @buildArguments
    if ($LASTEXITCODE -ne 0) { throw 'Signed Android bundle build failed.' }
  } finally { Pop-Location }
} finally {
  foreach ($name in @('SOLACE_ANDROID_STORE_FILE', 'SOLACE_ANDROID_STORE_PASSWORD', 'SOLACE_ANDROID_KEY_ALIAS', 'SOLACE_ANDROID_KEY_PASSWORD', 'SOLACE_ANDROID_BACKUP_PASSWORD')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}

