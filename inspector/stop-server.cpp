// Test-only console shutdown request for the isolated jadrapb child.
#include <windows.h>
int wmain(int argc,wchar_t**argv){if(argc!=2)return 2;DWORD pid=wcstoul(argv[1],nullptr,10);HANDLE p=OpenProcess(SYNCHRONIZE,FALSE,pid);if(!p)return 3;FreeConsole();if(!AttachConsole(pid))return 4;SetConsoleCtrlHandler(nullptr,TRUE);if(!GenerateConsoleCtrlEvent(CTRL_C_EVENT,0))return 5;auto code=WaitForSingleObject(p,20000);FreeConsole();CloseHandle(p);return code==WAIT_OBJECT_0?0:6;}
