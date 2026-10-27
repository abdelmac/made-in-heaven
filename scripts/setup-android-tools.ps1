param([switch]$AcceptLicenses)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsRoot = Join-Path $projectRoot '.local/mobile-tools'
$downloadRoot = Join-Path $toolsRoot 'downloads'
$sdkRoot = Join-Path $toolsRoot 'android-sdk'
New-Item -ItemType Directory -Force -Path $downloadRoot, $sdkRoot | Out-Null

$jdkRoot = Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'jdk-*' | Select-Object -First 1
if (-not $jdkRoot) {
  Write-Output 'Downloading the portable Eclipse Temurin JDK 21 from its official release...'
  $jdkInfo = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=windows&vendor=eclipse'
  $jdkPackage = @($jdkInfo)[0].binary.package
  $jdkArchive = Join-Path $downloadRoot $jdkPackage.name
  if (-not (Test-Path -LiteralPath $jdkArchive)) { Invoke-WebRequest -UseBasicParsing -Uri $jdkPackage.link -OutFile $jdkArchive }
  if ((Get-FileHash -LiteralPath $jdkArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $jdkPackage.checksum.ToLowerInvariant()) { throw 'JDK checksum verification failed.' }
  Expand-Archive -LiteralPath $jdkArchive -DestinationPath $toolsRoot -Force
  $jdkRoot = Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'jdk-*' | Select-Object -First 1
}
if (-not $jdkRoot) { throw 'The portable JDK was not found after extraction.' }
$env:JAVA_HOME = $jdkRoot.FullName
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$($jdkRoot.FullName)/bin;$sdkRoot/platform-tools;$env:Path"

$sdkManager = Join-Path $sdkRoot 'cmdline-tools/latest/bin/sdkmanager.bat'
if (-not (Test-Path -LiteralPath $sdkManager)) {
  Write-Output 'Downloading Android command-line tools from the official stable repository...'
  [xml]$repository = (Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/repository2-1.xml').Content
  $toolPackage = $repository.SelectNodes("//*[local-name()='remotePackage']") | Where-Object { $_.path -like 'cmdline-tools;*' -and $_.channelRef.ref -eq 'channel-0' } | Sort-Object { [int]$_.revision.major } -Descending | Select-Object -First 1
  $toolArchive = @($toolPackage.archives.archive) | Where-Object { $_.'host-os' -eq 'windows' } | Select-Object -First 1
  if (-not $toolArchive) { throw 'No stable Windows command-line tools archive was found.' }
  $archiveName = [string]$toolArchive.complete.url
  $sdkArchive = Join-Path $downloadRoot $archiveName
  if (-not (Test-Path -LiteralPath $sdkArchive)) { Invoke-WebRequest -UseBasicParsing -Uri "https://dl.google.com/android/repository/$archiveName" -OutFile $sdkArchive }
  $expectedChecksum = ([string]$toolArchive.complete.checksum.'#text').Trim()
  if (-not $expectedChecksum) { $expectedChecksum = ([string]$toolArchive.complete.checksum).Trim() }
  $checksumAlgorithm = if ($expectedChecksum.Length -eq 64) { 'SHA256' } else { 'SHA1' }
  if ((Get-FileHash -LiteralPath $sdkArchive -Algorithm $checksumAlgorithm).Hash.ToLowerInvariant() -ne $expectedChecksum.ToLowerInvariant()) { throw 'Android SDK checksum verification failed.' }
  $extractRoot = Join-Path $toolsRoot 'android-command-line-extract'
  Expand-Archive -LiteralPath $sdkArchive -DestinationPath $extractRoot -Force
  $sdkLatest = Join-Path $sdkRoot 'cmdline-tools/latest'
  New-Item -ItemType Directory -Force -Path $sdkLatest | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $extractRoot 'cmdline-tools') | Copy-Item -Destination $sdkLatest -Recurse -Force
}

if ($AcceptLicenses) {
  Write-Output 'Accepting Android SDK licenses as explicitly authorized...'
  $answers = 1..100 | ForEach-Object { 'y' }
  $answers | & $sdkManager "--sdk_root=$sdkRoot" --licenses
  if ($LASTEXITCODE -ne 0) { throw 'Android SDK license setup failed.' }
} else {
  Write-Output 'Review and accept any SDK licenses when prompted.'
}
$androidCli = Join-Path $sdkRoot 'cmdline-tools/latest/bin/android.exe'
if (Test-Path -LiteralPath $androidCli) {
  & $androidCli --sdk $sdkRoot --no-metrics sdk install 'platform-tools' 'platforms/android-36@2.0.0' 'build-tools/36.0.0@36.0.0'
} else {
  & $sdkManager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
}
if ($LASTEXITCODE -ne 0) { throw 'Android SDK package installation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'platforms/android-36/android.jar'))) { throw 'Android platform 36 was not installed.' }
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'build-tools/36.0.0/aapt2.exe'))) { throw 'Android build-tools 36.0.0 were not installed.' }
Write-Output "Portable Android tools are ready in $toolsRoot"
