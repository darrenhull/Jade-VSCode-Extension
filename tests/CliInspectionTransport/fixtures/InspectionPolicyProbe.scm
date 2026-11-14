jadeVersionNumber "25.0.01";
schemaDefinition
InspectionPolicyProbe subschemaOf RootSchema completeDefinition;
typeHeaders
 InspectionPolicyProbe subclassOf RootSchemaApp transient;
 GInspectionPolicyProbe subclassOf RootSchemaGlobal transient;
 SInspectionPolicyProbe subclassOf RootSchemaSession transient;
 BlankPasswordBase subclassOf Object abstract;
 BlankPasswordChild subclassOf BlankPasswordBase;

typeDefinitions
 InspectionPolicyProbe completeDefinition ( )
 GInspectionPolicyProbe completeDefinition ( )
 SInspectionPolicyProbe completeDefinition ( )
 BlankPasswordBase completeDefinition
 (
 attributeDefinitions
  probeLabel: String[40];
 jadeMethodDefinitions
  allowedToInspect(userName: String; password: String): Boolean;
  fixtureUserCheck(userName: String; password: String): Boolean final;
 )
 BlankPasswordChild completeDefinition ( )
databaseDefinitions
 InspectionPolicyProbeDb
 (
 databaseFileDefinitions
  "inspectionpolicyprobe";
 defaultFileDefinition "inspectionpolicyprobe";
 classMapDefinitions
  InspectionPolicyProbe in "_usergui";
  GInspectionPolicyProbe in "inspectionpolicyprobe";
  SInspectionPolicyProbe in "_environ";
  BlankPasswordBase in "inspectionpolicyprobe";
  BlankPasswordChild in "inspectionpolicyprobe";
 )
typeSources
 BlankPasswordBase (
 jadeMethodSources
allowedToInspect
{
allowedToInspect(userName: String; password: String): Boolean;
vars
    trace: File;
begin
    create trace transient;
    trace.fileName := "@POLICY_TRACE_PATH@";
    trace.mode := File.Mode_Append;
    trace.open;
    trace.writeLine("synthetic application filter invoked");
    trace.close;
    return fixtureUserCheck(userName, password);
epilog
    delete trace;
end;
}
fixtureUserCheck
{
fixtureUserCheck(userName: String; password: String): Boolean final;
vars
    result: Boolean;
begin
    if password <> null then
        result := password = "synthetic-accepted";
    endif;
    return result;
end;
}
 )
