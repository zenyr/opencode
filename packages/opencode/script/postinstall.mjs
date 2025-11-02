#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `opencode-${platform}-${arch}`
  const binary = platform === "windows" ? "opencode.exe" : "opencode"

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binary)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return binaryPath
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`)
  }
}

async function createWindowsCmdWrapper() {
  console.log("Creating Windows .cmd wrapper for opencode CLI")

  const pkgPath = path.join(__dirname, "..")
  const binDir = path.join(pkgPath, "bin")
  const cmdFile = path.join(binDir, "opencode.cmd")

  // Ensure bin directory exists
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const cmdContent = `@echo off
setlocal enabledelayedexpansion

if defined OPENCODE_BIN_PATH (
    set "resolved=%OPENCODE_BIN_PATH%"
    goto :execute
)

rem Get the directory of this script
set "script_dir=%~dp0"
set "script_dir=%script_dir:~0,-1%"

rem Detect platform and architecture
set "platform=windows"

rem Detect architecture
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "arch=x64"
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set "arch=arm64"
) else if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    set "arch=x86"
) else (
    set "arch=x64"
)

set "name=opencode-!platform!-!arch!"
set "binary=opencode.exe"

rem Search for the binary starting from script location
set "resolved="
set "current_dir=%script_dir%"

:search_loop
set "candidate=%current_dir%\\node_modules\\%name%\\bin\\%binary%"
if exist "%candidate%" (
    set "resolved=%candidate%"
    goto :execute
)

rem Move up one directory
for %%i in ("%current_dir%") do set "parent_dir=%%~dpi"
set "parent_dir=%parent_dir:~0,-1%"

rem Check if we've reached the root
if "%current_dir%"=="%parent_dir%" goto :not_found
set "current_dir=%parent_dir%"
goto :search_loop

:not_found
echo It seems that your package manager failed to install the right version of the opencode CLI for your platform. You can try manually installing the "%name%" package >&2
exit /b 1

:execute
rem Execute the binary with all arguments
"%resolved%" %*
exit /b %ERRORLEVEL%
`

  fs.writeFileSync(cmdFile, cmdContent)
  console.log(`Created Windows .cmd wrapper at ${cmdFile}`)
}

async function regenerateWindowsCmdWrappers() {
  console.log("Windows + npm detected: Setting up bin links")

  try {
    // First, create our own .cmd wrapper
    await createWindowsCmdWrapper()

    const { execSync } = require("child_process")
    const pkgPath = path.join(__dirname, "..")

    // npm_config_global is string | undefined
    // if it exists, the value is true
    const isGlobal = process.env.npm_config_global === "true" || pkgPath.includes(path.join("npm", "node_modules"))

    // The npm rebuild command does 2 things - Execute lifecycle scripts and rebuild bin links
    // We want to skip lifecycle scripts to avoid infinite loops, so we use --ignore-scripts
    const cmd = `npm rebuild opencode-ai --ignore-scripts${isGlobal ? " -g" : ""}`
    const opts = {
      stdio: "inherit",
      shell: true,
      ...(isGlobal ? {} : { cwd: path.join(pkgPath, "..", "..") }), // For local, run from project root
    }

    console.log(`Running: ${cmd}`)
    execSync(cmd, opts)
    console.log("Successfully rebuilt npm bin links")
  } catch (error) {
    console.error("Error during Windows setup:", error.message)
    console.error("npm rebuild failed. You may need to manually run: npm rebuild opencode-ai --ignore-scripts")
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      // NPM eg format - npm/11.4.2 node/v24.4.1 win32 x64
      // Bun eg format - bun/1.2.19 npm/? node/v24.3.0 win32 x64
      if (process.env.npm_config_user_agent?.startsWith("npm")) {
        await regenerateWindowsCmdWrappers()
      } else {
        console.log("Windows detected but not npm, skipping postinstall")
      }
      return
    }

    try {
      const binaryPath = findBinary()
      const binScript = path.join(__dirname, "bin", "opencode")

      // Remove existing bin script if it exists
      if (fs.existsSync(binScript)) {
        fs.unlinkSync(binScript)
      }

      // Create symlink to the actual binary
      fs.symlinkSync(binaryPath, binScript)
      console.log(`opencode binary symlinked: ${binScript} -> ${binaryPath}`)
    } catch (error) {
      console.log(`Skipping postinstall: Binary not available (${error.message}). This is normal during development.`)
    }
  } catch (error) {
    console.error("Postinstall script error:", error.message)
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
