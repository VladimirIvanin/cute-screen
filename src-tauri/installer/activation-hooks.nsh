!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var CsStartupCheckbox
Var CsStartupChoice
Var CsStartupConfirmed

Page custom CsStartupCreate CsStartupLeave

Function CsStartupCreate
  IfSilent cs_startup_skip
  ClearErrors
  ${GetOptions} $CMDLINE "/P" $3
  ${IfNot} ${Errors}
    Goto cs_startup_skip
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  StrCpy $CsStartupChoice 1
  ClearErrors
  ReadRegDWORD $1 HKCU "Software\io.github.vladimirivanin.cute-screen" "AutostartChoice"
  ${IfNot} ${Errors}
    StrCpy $CsStartupChoice $1
  ${EndIf}
  StrCpy $2 "Start Cute Screen when I sign in"
  ${If} $LANGUAGE = 1049
    StrCpy $2 "Запускать Cute Screen при входе в систему"
  ${EndIf}
  ${NSD_CreateCheckbox} 0 24u 100% 24u $2
  Pop $CsStartupCheckbox
  ${If} $CsStartupChoice = 1
    ${NSD_Check} $CsStartupCheckbox
  ${EndIf}
  nsDialogs::Show
  Return
  cs_startup_skip:
  Abort
FunctionEnd

Function CsStartupLeave
  ${NSD_GetState} $CsStartupCheckbox $CsStartupChoice
  StrCpy $CsStartupConfirmed 1
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $CsStartupConfirmed = 1
    WriteRegDWORD HKCU "Software\io.github.vladimirivanin.cute-screen" "AutostartChoice" $CsStartupChoice
  ${Else}
    ClearErrors
    ReadRegDWORD $CsStartupChoice HKCU "Software\io.github.vladimirivanin.cute-screen" "AutostartChoice"
    ${If} ${Errors}
      StrCpy $CsStartupChoice 0
    ${EndIf}
  ${EndIf}
  ${If} $CsStartupChoice = 1
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.vladimirivanin.cute-screen" '$"$INSTDIR\${MAINBINARYNAME}.exe$" --background'
  ${ElseIf} $CsStartupConfirmed = 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.vladimirivanin.cute-screen"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.vladimirivanin.cute-screen"
  ; Keep the user's choice across the upgrade uninstall/install cycle.
!macroend
