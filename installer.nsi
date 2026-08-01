; ColdADE installer
;
; Deliberately page-less: the user double-clicks the exe, sees a progress bar,
; and the app opens. No welcome screen, no licence page, no directory picker,
; no UAC prompt — RequestExecutionLevel user keeps it a per-user install under
; %LOCALAPPDATA%, which needs no elevation.
;
; Built with the makensis that ships in electron-builder's cache:
;   makensis /DVERSION=1.0.0 installer.nsi

Unicode true

!ifndef VERSION
  !define VERSION "1.0.0"
!endif

!define APPNAME    "ColdADE"
!define ALIAS      "Agent Launcher (ColdADE)"
!define COMPANY    "caprarim"
!define SOURCEDIR  "release\win-unpacked"
!define UNINSTKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "release\${APPNAME}-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

Icon "assets\icon.ico"
UninstallIcon "assets\icon.ico"

; Progress only, then get out of the way.
ShowInstDetails nevershow
ShowUninstDetails nevershow
AutoCloseWindow true
XPStyle on

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName"     "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} installer"
VIAddVersionKey "CompanyName"     "${COMPANY}"
VIAddVersionKey "LegalCopyright"  "MIT"
VIAddVersionKey "FileVersion"     "${VERSION}"
VIAddVersionKey "ProductVersion"  "${VERSION}"

Page instfiles
UninstPage instfiles

Function .onInit
  ; A second install over a running copy would fail to overwrite the exe.
  nsExec::Exec 'taskkill /IM "${APPNAME}.exe" /F'
  Pop $0
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "${SOURCEDIR}\*.*"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\${APPNAME}.exe" 0
  CreateShortCut "$DESKTOP\${APPNAME}.lnk"    "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\${APPNAME}.exe" 0

  ; Start Menu search matches on the shortcut's file name, so "ColdADE" alone is
  ; invisible to anyone who still types the old name. This second shortcut points
  ; at the same exe and makes "agent launcher" find it too.
  CreateShortCut "$SMPROGRAMS\${ALIAS}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\${APPNAME}.exe" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"

  ; Appear in Settings > Apps like any normal program.
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${UNINSTKEY}" "Publisher"       "${COMPANY}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\${APPNAME}.exe"
  WriteRegStr   HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; Straight into the app — this is the "just installs it" behaviour.
  Exec '"$INSTDIR\${APPNAME}.exe"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${APPNAME}.exe" /F'
  Pop $0

  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${ALIAS}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
SectionEnd
