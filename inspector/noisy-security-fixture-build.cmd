@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
pushd "%~dp0"
if not exist build mkdir build
cl /nologo /std:c++20 /EHsc /O2 /MD /DUNICODE /D_UNICODE /I"C:\Jade2025\include" /I"..\..\development\cpp-backend\third_party" /LD noisy-security-fixture.cpp /Fo:build\ /Fe:build\noisy-security-fixture.dll
set "buildResult=%errorlevel%"
popd
exit /b %buildResult%
