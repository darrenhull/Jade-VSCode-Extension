// Isolated modern native notification dispatch proof. Never packaged.
#include "runtime.hpp"
#include <jomdefs.h>
json received;
void notify(void *, bool system, unsigned event, const Oid &target, const Oid &subscriber,
            unsigned userTag, const DskParam *value)
{
    received = {{"system", system}, {"event", event}, {"target", hex(&target,22)},
                {"subscriber",hex(&subscriber,22)}, {"userTag",userTag},
                {"format", value ? int(value->header.format) : -1}};
    if (value && value->header.format == DSKINTEGER)
        received["integer"] = value->body.integer;
}
int wmain(int argc,wchar_t **argv)
{
    try
    {
        if(argc != 2) throw std::runtime_error("Expected isolated notification config.");
        std::ifstream file{std::filesystem::path(argv[1])};json config;file>>config;
        auto expected=std::filesystem::weakly_canonical(std::filesystem::path(argv[1]).parent_path()/L"notification-database"/L"system");
        auto actual=std::filesystem::weakly_canonical(std::filesystem::path(wide(config.at("databasePath"))));
        if(actual!=expected||expected.parent_path().filename()!=L"notification-database")
            throw std::runtime_error("Only the isolated notification test database is permitted.");
        MSG message{};PeekMessageW(&message,nullptr,0,0,PM_NOREMOVE);
        Runtime r(config);
        auto subscriber=Param::oid(r.instances[1]);
        auto target=r.instances[1];
        r.check(proc<decltype(&jomBeginNotification)>(r.jom,"jomBeginNotification")(
            &r.process,&subscriber.value,nullptr,&target,ALL_USER_EVENTS,NOTE_ALL,NOTE_SUBSCRIBER_DOTNET,917,0),"Subscribe native event");
        auto value=Param::integer(1234);
        r.check(proc<decltype(&jomCauseEvent)>(r.jom,"jomCauseEvent")(
            &r.process,&target,24,1,&value.value,nullptr,0),"Cause native event");
        int queued=0;r.check(proc<decltype(&jomCountQueuedNotifications)>(r.jom,"jomCountQueuedNotifications")(&r.process,&queued,0),"Count queued notes");std::cerr<<"queued="<<queued<<std::endl;
        using Notify=void(*)(void*,bool,unsigned,const Oid&,const Oid&,unsigned,const DskParam*);
        auto dispatch=proc<int(*)(void*,unsigned,Notify,const DskHandle*)>(r.jom,"jomNotifyCallbackForDotNet");
        for(unsigned i=0;i<50&&received.is_null();i++)
        {
            while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE))
            {
                std::cerr<<"message="<<std::hex<<message.message<<" token="<<message.lParam<<std::endl;
                if(message.message==WM_THREAD_CALLBACK||message.message==WM_THREADWRAPPED_CALLBACK)
                    r.check(dispatch(nullptr,unsigned(message.lParam),notify,&r.node),"Dispatch native event");
                else {TranslateMessage(&message);DispatchMessageW(&message);}
            }
            if(received.is_null())MsgWaitForMultipleObjects(0,nullptr,FALSE,100,QS_ALLINPUT);
        }
        r.check(proc<int(*)(const DskHandle*,const Oid*,unsigned,const DskParam*,const DskParam*,NoteSubscriberType)>(
            r.jom,"joobEndNotification")(&r.process,&target,ALL_USER_EVENTS,&subscriber.value,nullptr,NOTE_SUBSCRIBER_DOTNET),
            "End native DotNet-format subscription");
        int remaining=0;r.check(proc<decltype(&jomCountQueuedNotifications)>(r.jom,"jomCountQueuedNotifications")(
            &r.process,&remaining,0),"Check native queue drained");
        if(!received.is_null())received["remaining"]=remaining;
        if(received.is_null())throw std::runtime_error("No native notification was delivered.");
        std::cout<<received.dump()<<std::endl;return 0;
    }
    catch(const std::exception &error){std::cerr<<error.what()<<std::endl;return 2;}
}
