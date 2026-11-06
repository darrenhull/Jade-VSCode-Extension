// Isolated native application startup proof. Not included in the extension package.
#include "runtime.hpp"
std::string nativeString(Param &value)
{
    if (value.value.header.format == DSKCSTRING)
        return utf8(value.value.body.pText);
    Size length{};
    if (JADE_STRING_LENGTH(&value.value.body.dataHandler, length))
        throw std::runtime_error("Expected a native String.");
    std::wstring text(length + 1, 0);
    if (JADE_GET_STRING(&value.value.body.dataHandler, text.data(), length + 1))
        throw std::runtime_error("Cannot read native String.");
    text.resize(length);
    return utf8(text);
}
int wmain(int argc, wchar_t **argv)
{
    try
    {
        if (argc != 3)
            throw std::runtime_error("Expected isolated private config and startup string.");
        std::ifstream file{std::filesystem::path(argv[1])};
        json config;
        file >> config;
        auto actual = std::filesystem::weakly_canonical(
            std::filesystem::path(wide(config.at("databasePath"))));
        auto expected = std::filesystem::weakly_canonical(
            std::filesystem::path(argv[1]).parent_path() / L"policy-database" / L"system");
        if (actual != expected || expected.parent_path().filename() != L"policy-database" ||
            expected.parent_path().parent_path().filename() != L"build" ||
            expected.parent_path().parent_path().parent_path().filename() != L"inspector")
            throw std::runtime_error("Only the isolated native policy test database is permitted.");
        config["schema"] = "SJetSchema";
        Runtime r(config, true);
        auto className = Param::string("SJetSchema");
        Param appClass(DSKOBJECTID);
        r.send(r.instances[3], "getClass", {&className}, appClass);
        auto classId = appClass.object();
        Meta type(r, "DskClass", &classId);
        Meta schemaDefinition(r, "DskSchema", &r.instances[3]), appDefinition(r, "DskObject");
        r.check(proc<int (*)(void *, const wchar_t *, void *)>(r.jom,
                "?getApplication@DskSchema@@QEBAHQEB_WAEAVDskObject@@@Z")(
                schemaDefinition.data, L"SJetSchema", appDefinition.data), "Find private fixture app definition");
        auto definitionOid = appDefinition.oid();
        r.check(proc<decltype(&jomBeginTransaction)>(r.jom, "jomBeginTransaction")(
                &r.process, PERSISTENT_TRANSACTION, 0), "Begin private fixture application configuration");
        struct AbortFixtureTransaction
        {
            Runtime &runtime;
            bool committed = false;
            ~AbortFixtureTransaction()
            {
                if (!committed)
                    proc<decltype(&jomAbortTransaction)>(runtime.jom, "jomAbortTransaction")(
                        &runtime.process, PERSISTENT_TRANSACTION, 0);
            }
        } transaction{r};
        for (auto &methodId : type.members("?methods@DskType@@UEBAHAEAVJomColl@@@Z"))
        {
            Meta method(r, "DskMethod", &methodId);
            auto name = method.name();

            if (name != "probeInitialize" && name != "probeFinalize")
                continue;
            auto property = Param::string(name == "probeInitialize" ? "initializeMethod" : "finalizeMethod");
            auto value = Param::oid(methodId);
            r.check(proc<decltype(&jomSetProperty)>(r.jom, "jomSetProperty")(
                &r.process, &definitionOid, &property.value, &value.value, 0), "Configure private fixture lifecycle");
        }
        auto typeField = Param::string("applicationType");
        Param nativeType(DSKCHARACTER);
        nativeType.value.body.character = L'S';
        r.check(proc<decltype(&jomSetProperty)>(r.jom, "jomSetProperty")(
            &r.process, &definitionOid, &typeField.value, &nativeType.value, 0), "Configure ordinary non-GUI fixture");
        r.check(proc<decltype(&jomEndTransaction)>(r.jom, "jomEndTransaction")(
                &r.process, PERSISTENT_TRANSACTION, 0), "Commit private fixture application configuration");
        transaction.committed = true;
        r.check(proc<decltype(&jomSignOff)>(r.jom, "jomSignOff")(&r.process, 0), "Close initial test context");
        r.signedOn = false;
        r.process = {};
        r.security = {};
        auto schema = Param::string("SJetSchema"), app = Param::string("SJetSchema"),
             user = Param::string(""), password = Param::string(""), mode = Param::integer(0), usage = Param::integer(0);
        r.check(proc<decltype(&jomSignOn)>(r.jom, "jomSignOn")(
            &r.node, &r.process, &r.security, &schema.value, &app.value, &user.value, &password.value,
            &mode.value, &usage.value, 0), "Sign on fixture application");
        r.signedOn = true;
        r.check(proc<decltype(&jomGetExecInstances)>(r.jom, "jomGetExecInstances")(
            &r.process, &r.instances[0], &r.instances[1], &r.instances[2], &r.instances[3], &r.instances[4],
            &r.instances[5], &r.instances[6], &r.instances[7], 0), "Get application receiver");
        Param actualType(DSKCHARACTER);
        r.property(r.instances[1], "applicationType", actualType);
        if (actualType.value.body.character != L'S')
            throw std::runtime_error("The native application is not ordinary non-GUI S.");
        auto input = Param::string(utf8(argv[2]));
        r.check(proc<decltype(&jomInitializeApplication)>(r.jom, "jomInitializeApplication")(
            &r.process, true, &input.value, 0), "Native application initialize");
        Any value(r);
        r.property(r.instances[1], "nativeLaunchParameter", value);
        const auto received = nativeString(value);
        r.check(proc<decltype(&jomFinalizeApplication)>(r.jom, "jomFinalizeApplication")(
            &r.process, true, 0), "Native application finalize");
        Any finalized(r);
        r.property(r.instances[1], "nativeLaunchParameter", finalized);
        std::cout << json{{"received",received}, {"finalized",nativeString(finalized)},
                         {"nativeInitialize",true},{"nativeFinalize",true},{"applicationType",utf8(std::wstring(1, actualType.value.body.character))}}.dump() << std::endl;
        return 0;
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << std::endl;
        return 2;
    }
}
