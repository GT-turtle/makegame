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

$driveLetters = @("X", "W", "V", "U") |
  Where-Object { -not (Test-Path -LiteralPath "${_}:\") } |
  Select-Object -First 2

if ($driveLetters.Count -lt 2) {
  throw "Two temporary drive letters are required for the Android build."
}

$projectDrive = "$($driveLetters[0]):"
$buildDrive = "$($driveLetters[1]):"
$mappedProject = "${projectDrive}\"
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ("packforge-android-build-" + $PID)
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

& subst.exe $projectDrive $projectDir
if ($LASTEXITCODE -ne 0) { throw "Could not create the temporary Android build path." }

try {
  & subst.exe $buildDrive $buildRoot
  if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated Android output path." }

  try {
    $env:JAVA_HOME = Join-Path $mappedProject (".jdk\" + $jdkDir.Name)
    $env:ANDROID_HOME = Join-Path $mappedProject ".android-sdk"
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $env:GRADLE_USER_HOME = Join-Path $mappedProject ".gradle-home"
    $env:PACKFORGE_GRADLE_BUILD_ROOT = "${buildDrive}\"
    $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

    Push-Location (Join-Path $mappedProject "android")
    try {
      & .\gradlew.bat assembleRelease --no-daemon
      if ($LASTEXITCODE -ne 0) { throw "Android release build failed." }
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item Env:PACKFORGE_GRADLE_BUILD_ROOT -ErrorAction SilentlyContinue
    & subst.exe $buildDrive /D
  }
} finally {
  & subst.exe $projectDrive /D
}

$sourceApk = Join-Path $buildRoot "app\outputs\apk\release\app-release.apk"
$distDir = Join-Path $projectDir "dist"
$packageJson = Get-Content -LiteralPath (Join-Path $projectDir "package.json") -Raw | ConvertFrom-Json
$targetApk = Join-Path $distDir ("packforge-prototype-v" + $packageJson.version + ".apk")

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedBuildRoot = [IO.Path]::GetFullPath($buildRoot)
if ($resolvedBuildRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
  Remove-Item -LiteralPath $resolvedBuildRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$file = Get-Item -LiteralPath $targetApk
$sha256 = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($targetApk)
try {
  $hash = ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
} finally {
  $stream.Dispose()
  $sha256.Dispose()
}
Write-Output "APK: $($file.FullName)"
Write-Output "Size: $($file.Length) bytes"
Write-Output "SHA-256: $hash"
