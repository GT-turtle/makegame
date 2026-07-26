$ErrorActionPreference = "Stop"

$projectDir = Split-Path $PSScriptRoot -Parent
$jdkDir = Get-ChildItem -LiteralPath (Join-Path $projectDir ".jdk") |
  Where-Object { $_.PSIsContainer } |
  Select-Object -First 1
$sdkDir = Join-Path $projectDir ".android-sdk"

if ($null -eq $jdkDir -or -not (Test-Path -LiteralPath $sdkDir)) {
  throw "Android build tools are missing. Prepare .jdk and .android-sdk first."
}

Push-Location $projectDir
try {
  & node scripts/prepare-mobile.mjs
  if ($LASTEXITCODE -ne 0) { throw "Preparing mobile assets failed." }

  & node node_modules/@capacitor/cli/bin/capacitor sync android
  if ($LASTEXITCODE -ne 0) { throw "Capacitor Android sync failed." }
} finally {
  Pop-Location
}

$driveLetter = @("X", "W", "V", "U") |
  Where-Object { -not (Test-Path -LiteralPath "${_}:\") } |
  Select-Object -First 1

if (-not $driveLetter) {
  throw "No temporary drive letter is available for the Android build."
}

$drive = "${driveLetter}:"
$mappedProject = "${drive}\"

& subst.exe $drive $projectDir
if ($LASTEXITCODE -ne 0) { throw "Could not create the temporary Android build path." }

try {
  $env:JAVA_HOME = Join-Path $mappedProject (".jdk\" + $jdkDir.Name)
  $env:ANDROID_HOME = Join-Path $mappedProject ".android-sdk"
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $env:GRADLE_USER_HOME = Join-Path $mappedProject ".gradle-home"
  $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

  Push-Location (Join-Path $mappedProject "android")
  try {
    & .\gradlew.bat assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Android release build failed." }
  } finally {
    Pop-Location
  }
} finally {
  & subst.exe $drive /D
}

$sourceApk = Join-Path $projectDir "android\app\build\outputs\apk\release\app-release.apk"
$distDir = Join-Path $projectDir "dist"
$targetApk = Join-Path $distDir "packforge-prototype-v0.3.0.apk"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

$file = Get-Item -LiteralPath $targetApk
$hash = (Get-FileHash -LiteralPath $targetApk -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "APK: $($file.FullName)"
Write-Output "Size: $($file.Length) bytes"
Write-Output "SHA-256: $hash"
