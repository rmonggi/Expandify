; Expandify Installer Script (NSIS)
; This script provides a professional installer with all the features

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

; Basic Settings
Name "Expandify"
OutFile "Expandify-Setup.exe"
InstallDir "$PROGRAMFILES\Expandify"
InstallDirRegKey HKCU "Software\Expandify" "InstallLocation"

; MUI Settings
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; Check for existing installation
Function .onInit
  ReadRegStr $R0 HKCU "Software\Expandify" "InstallLocation"
  ${If} $R0 != ""
    MessageBox MB_OKCANCEL "Expandify is already installed. Do you want to reinstall it?" IDOK reinstall IDCANCEL quit
    quit:
      Quit
    reinstall:
  ${EndIf}
FunctionEnd

; Installation
Section "Install"
  SetOutPath "$INSTDIR"
  
  ; Copy files
  File "*.exe"
  File "*.js"
  File "*.html"
  File "*.json"
  File "*.png"
  
  ; Write registry
  WriteRegStr HKCU "Software\Expandify" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Expandify" "DisplayName" "Expandify"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Expandify" "UninstallString" "$INSTDIR\uninstall.exe"
  
  ; Create start menu shortcuts
  SectionGetFlags ${SEC0} $0
  ${If} $0 & ${SF_SELECTED}
    CreateDirectory "$SMPROGRAMS\Expandify"
    CreateShortCut "$SMPROGRAMS\Expandify\Expandify.lnk" "$INSTDIR\Expandify.exe"
    CreateShortCut "$SMPROGRAMS\Expandify\Uninstall.lnk" "$INSTDIR\uninstall.exe"
  ${EndIf}
  
  ; Create desktop shortcut
  SectionGetFlags ${SEC1} $0
  ${If} $0 & ${SF_SELECTED}
    CreateShortCut "$DESKTOP\Expandify.lnk" "$INSTDIR\Expandify.exe"
  ${EndIf}
SectionEnd

; Uninstall
Section "Uninstall"
  Delete "$INSTDIR\*.*"
  RMDir "$INSTDIR"
  
  Delete "$SMPROGRAMS\Expandify\*.*"
  RMDir "$SMPROGRAMS\Expandify"
  
  Delete "$DESKTOP\Expandify.lnk"
  
  DeleteRegKey HKCU "Software\Expandify"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Expandify"
SectionEnd
