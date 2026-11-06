jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
 DebugDemo subclassOf Object transient, transientAllowed, subclassTransientAllowed;
typeDefinitions
 DebugDemo completeDefinition
 (
 jadeMethodDefinitions
  entry();
  greeting() : String;
 calculate() : Integer;
 )
typeSources
DebugDemo (
jadeMethodSources
calculate
{
calculate() : Integer;
vars
 answer : Integer;
begin
 answer := 40;
 answer := answer + 2;
 return answer;
end;
}
greeting
{
greeting() : String;
vars
 message : String;
begin
 message := "Hello from native Jade";
 return message;
end;
}
entry
{
entry();
vars
 message : String;
 answer : Integer;

begin
 message := self.greeting();
 answer := self.calculate();
 answer := answer + 5;
end;
}
)
