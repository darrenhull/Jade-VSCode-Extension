schemaDefinition
Pets subschemaOf RootSchema partialDefinition;
typeHeaders
Fish subclassOf Object transient;
typeDefinitions
Fish completeDefinition
(
attributeDefinitions
 balance: Decimal[12,2] protected subschemaHidden;
 label: String[80] readonly;
jadeMethodDefinitions
 run(left,right: String input; result: Integer output): String protected updating typeMethod;
)
typeSources
Fish (
jadeMethodSources
run
{
run(left,right: String input; result: Integer output): String protected updating typeMethod;
begin
 return "BODY_MUST_NOT_COPY";
end;
}
)
