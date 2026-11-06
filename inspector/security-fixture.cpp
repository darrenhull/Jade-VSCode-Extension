// Test-only implementation of Jade's documented development security ABI.
#include <windows.h>
#include <cwchar>
extern "C" __declspec(dllexport) int __stdcall jadeDevelopmentUserInfo(const wchar_t *user,const wchar_t *password){return user&&password&&!wcscmp(user,L"inspector-test")&&!wcscmp(password,L"test-only")?0:1713;}
#ifndef MISSING_TASK
extern "C" __declspec(dllexport) int __stdcall jadeDevelopmentFunctionSelected(const wchar_t *user,const wchar_t *task,const wchar_t *entity){if(!user||wcscmp(user,L"inspector-test"))return 1713;return entity&&wcsstr(entity,L"InspectorDeniedItem")?1713:0;}
#endif
