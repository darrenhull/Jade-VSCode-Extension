// Connected-test fixture writer. This binary is never packaged in the extension.
#include "runtime.hpp"
int wmain(int argc, wchar_t **argv)
{
    try
    {
        if (argc != 2)
            throw std::runtime_error("Expected private test database config.");
        std::ifstream file{std::filesystem::path(argv[1])};
        json settings;
        file >> settings;
        settings["schema"] = "SJetSchema";
        Runtime r(settings, true);
        auto name = Param::string("InspectorFixtureItem");
        Param cls(DSKOBJECTID);
        r.send(r.instances[3], "getClass", {&name}, cls);
        auto classOid = cls.object();
        Meta type(r, "DskClass", &classOid);
        const auto number = type.scalar<unsigned>("?getNumber@DskSchemaEntity@@UEBAHPEAII@Z");
        auto ensureDenied = [&]() {
            auto name = Param::string("InspectorDeniedItem");
            Param cls(DSKOBJECTID);
            r.send(r.instances[3], "getClass", {&name}, cls);
            auto id = cls.object();
            auto first = r.get(id, "firstInstance").object();
            if (!nullOid(first))
                return;
            Meta type(r, "DskClass", &id);
            const auto number = type.scalar<unsigned>("?getNumber@DskSchemaEntity@@UEBAHPEAII@Z");
            r.check(proc<decltype(&jomBeginTransaction)>(r.jom, "jomBeginTransaction")(
                        &r.process, PERSISTENT_TRANSACTION, 0),
                    "Begin denied fixture transaction");
            try
            {
                Oid object{};
                object.set(number, 0);
                r.check(proc<decltype(&jomCreateObject)>(r.jom, "jomCreateObject")(
                            &r.process, &object, CLASS_PERSISTENT, nullptr, nullptr, 0),
                        "Create denied fixture");
                r.check(proc<decltype(&jomEndTransaction)>(r.jom, "jomEndTransaction")(
                            &r.process, PERSISTENT_TRANSACTION, 0),
                        "Commit denied fixture transaction");
                std::cout << "Denied fixture OID=" << hex(&object, 22) << "\n";
            }
            catch (...)
            {
                proc<decltype(&jomAbortTransaction)>(r.jom, "jomAbortTransaction")(&r.process,
                                                                                   PERSISTENT_TRANSACTION, 0);
                throw;
            }
        };
        auto first = r.get(classOid, "firstInstance").object();
        if (!nullOid(first))
        {
            ensureDenied();
            std::cout << "Fixtures already exist\n";
            return 0;
        }
        r.check(proc<decltype(&jomBeginTransaction)>(r.jom, "jomBeginTransaction")(&r.process,
                                                                                   PERSISTENT_TRANSACTION, 0),
                "Begin private fixture transaction");
        try
        {
            std::vector<Oid> objects;
            for (int i = 0; i < 3; i++)
            {
                Oid object{};
                object.set(number, 0);
                r.check(proc<decltype(&jomCreateObject)>(r.jom, "jomCreateObject")(
                            &r.process, &object, CLASS_PERSISTENT, nullptr, nullptr, 0),
                        "Create private fixture");
                objects.push_back(object);
            }
            auto set = [&](const Oid &object, const std::string &name, Param &value) {
                auto property = Param::string(name);
                r.check(proc<decltype(&jomSetProperty)>(r.jom, "jomSetProperty")(
                            &r.process, &object, &property.value, &value.value, 0),
                        "Set private fixture property");
            };
            for (size_t i = 0; i < objects.size(); i++)
            {
                auto value = Param::string(std::vector<std::string>{"Charlie", "Alpha", "Bravo"}[i]);
                set(objects[i], "name", value);
                auto rank = Param::integer(int(i + 1));
                set(objects[i], "rank", rank);
                auto peer = Param::oid(objects[(i + 1) % objects.size()]);
                set(objects[i], "peer", peer);
                auto active = Param::boolean(i != 1);
                set(objects[i], "active", active);
            }
            Param date(DSKDATE);
            date.value.body.date = 0;
            for (auto &object : objects)
                set(object, "dateOfBirth", date);
            Param children(DSKOBJECTID);
            r.property(objects[0], "children", children);
            for (auto index : {1, 2})
            {
                auto value = Param::oid(objects[index]);
                Param ignored;
                r.send(children.object(), "add", {&value}, ignored);
            }
            r.check(proc<decltype(&jomEndTransaction)>(r.jom, "jomEndTransaction")(&r.process,
                                                                                   PERSISTENT_TRANSACTION, 0),
                    "Commit private fixture transaction");
            std::cout << "Created 3 persistent inspection fixtures\n";
        }
        catch (...)
        {
            proc<decltype(&jomAbortTransaction)>(r.jom, "jomAbortTransaction")(&r.process,
                                                                               PERSISTENT_TRANSACTION, 0);
            throw;
        }
        ensureDenied();
        return 0;
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << "\n";
        return 2;
    }
}
