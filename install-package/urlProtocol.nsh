!macro customInstall
  DetailPrint "Register owtclient URI Handler"
  DeleteRegKey HKCR "owtclient"
  WriteRegStr HKCR "owtclient" "" "URL:owtclient"
  WriteRegStr HKCR "owtclient" "URL Protocol" ""
  WriteRegStr HKCR "owtclient\shell" "" ""
  WriteRegStr HKCR "owtclient\shell\Open" "" ""
  WriteRegStr HKCR "owtclient\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"
!macroend