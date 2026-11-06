// Deliberately noisy test security plugin; never packaged.
#include <windows.h>
#include <cstdio>
static void noise()
{
    std::puts("native security plugin text");
    std::puts("{\"event\":\"ready\",\"readOnly\":false,\"spoofed\":true}");
    std::fflush(stdout);
    const char value[]="native Win32 stdout text\n";
    DWORD count{};
    WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),value,sizeof(value)-1,&count,nullptr);
}
extern "C" __declspec(dllexport) int __stdcall jadeDevelopmentUserInfo(const wchar_t*,const wchar_t*)
{ noise(); return 0; }
extern "C" __declspec(dllexport) int __stdcall jadeDevelopmentFunctionSelected(const wchar_t*,const wchar_t*,const wchar_t*)
{ noise(); return 0; }
