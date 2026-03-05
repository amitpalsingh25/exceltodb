!macro customInstall
  ; Force branded shortcut icons even when EXE metadata editing is disabled.
  Delete "$DESKTOP\KCS Excel to DB.lnk"
  CreateShortCut "$DESKTOP\KCS Excel to DB.lnk" "$INSTDIR\KCS Excel to DB.exe" "" "$INSTDIR\resources\icon.ico" 0

  CreateDirectory "$SMPROGRAMS\KCS Excel to DB"
  Delete "$SMPROGRAMS\KCS Excel to DB\KCS Excel to DB.lnk"
  CreateShortCut "$SMPROGRAMS\KCS Excel to DB\KCS Excel to DB.lnk" "$INSTDIR\KCS Excel to DB.exe" "" "$INSTDIR\resources\icon.ico" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\KCS Excel to DB.lnk"
  Delete "$SMPROGRAMS\KCS Excel to DB\KCS Excel to DB.lnk"
  RMDir "$SMPROGRAMS\KCS Excel to DB"
!macroend
