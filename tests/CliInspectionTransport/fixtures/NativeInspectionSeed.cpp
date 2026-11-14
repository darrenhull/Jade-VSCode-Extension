// Explicit ANSI SDK fixture seeder only; never part of the extension product or default tests.
#define NOMINMAX
#include <windows.h>
#define DSKPARAM_LINKAGE
#include <jomcalls.h>
#include <jomparam.hpp>
#include <jomobj.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
namespace fs=std::filesystem;
void check(int code){if(code)throw std::runtime_error("Synthetic seed SDK failure: "+std::to_string(code));}
DskParam text(const char* value){DskParam p{};paramSetCString(p,value);return p;}
int wmain(int argc,wchar_t**argv)try{
 static_assert(sizeof(Character)==1,"Compile this disposable fixture helper with the matching ANSI SDK");
 if(argc!=3)throw std::runtime_error("Owned seed root and matching ANSI SDK required");
 const auto root=fs::weakly_canonical(argv[1]),install=fs::weakly_canonical(argv[2]);
 wchar_t local[32768]{};if(!GetEnvironmentVariableW(L"LOCALAPPDATA",local,32768))throw std::runtime_error("Local cache unavailable");
 const auto cache=fs::weakly_canonical(fs::path(local)/L"JadeTools"/L"test-cache");
 if(root.parent_path()!=cache||!root.filename().wstring().starts_with(L"jade-extension-inspection-seed-"))throw std::runtime_error("Not an owned extension seed");
 std::ifstream owner(root/L"owner.txt");std::string marker;std::getline(owner,marker);
 if(marker!="extension-inspection-proof"||!fs::is_regular_file(root/L"source"/L"system"/L"_control.dat"))throw std::runtime_error("Owned Source receipt missing");
 const auto bin=install/L"bin";SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);AddDllDirectory(bin.c_str());
 if(!LoadLibraryExW((bin/L"jom.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS))throw std::runtime_error("Cannot load configured SDK");
 DskHandle node{},process{},security{};bool initialized=false,signedOn=false;
 try{
  const auto database=(root/L"source"/L"system").string(),ini=(root/L"source"/L"source.ini").string();
  auto db=text(database.c_str()),iniArg=text(ini.c_str()),server=text("singleUser");
  check(jomInitialize(&node,&db,&server,&iniArg));initialized=true;
  auto schemaArg=text("RootSchema"),app=text("RootSchemaApp"),user=text(""),password=text("");
  DskParam mode{},usage{};mode.header.format=DSKINTEGER;usage.header.format=DSKINTEGER;usage.body.integer=DB_UPDATE;
  check(jomSignOn(&node,&process,&security,&schemaArg,&app,&user,&password,&mode,&usage,0));signedOn=true;
  DskObjectId instances[8]{};check(jomGetExecInstances(&process,&instances[0],&instances[1],&instances[2],&instances[3],&instances[4],&instances[5],&instances[6],&instances[7],0));
  DskSchema base(&instances[2]),schema;check(base.findSchema(TEXT("InspectionPolicyProbe"),schema));
  DskClass child;check(schema.getSchemaClass(TEXT("BlankPasswordChild"),child));
  UInt32 number{};check(child.getNumber(&number));DskObjectId object;object.set(number,0);
  check(jomBeginTransaction(&process,PERSISTENT_TRANSACTION,0));
  check(jomCreateObject(&process,&object,CLASS_PERSISTENT,nullptr,nullptr,0));
  auto property=text("probeLabel"),value=text("SYNTHETIC inspection proof only");
  check(jomSetProperty(&process,&object,&property,&value,0));check(jomEndTransaction(&process,PERSISTENT_TRANSACTION,0));
  auto selector=text("allowedToInspect"),name=text("SyntheticInspector");DskParam args{},result{};
  args.header.format=DSKPARAMLIST;args.body.parameterList.entries=2;args.body.parameterList.size=2*sizeof(DskParam*);
  args.body.parameterList.param[0]=&name;args.body.parameterList.param[1]=&password;result.header.format=DSKBOOLEAN;
  check(jomSendMsg(&process,&object,&selector,&args,&result,0));
  if(result.header.format!=DSKBOOLEAN||result.body.boolean)throw std::runtime_error("Blank-password synthetic policy did not deny");
  check(jomSignOff(&process,0));signedOn=false;check(jomFinalize(&node));initialized=false;
  std::cout<<"Synthetic inherited blank-password policy denied; one stored instance seeded.\n";
 }catch(...){if(signedOn)jomSignOff(&process,0);if(initialized)jomFinalize(&node);throw;}
 return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}