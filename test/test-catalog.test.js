'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareTests,testsInSource}=require('../extension/src/test-catalog');
test('pulled-test verification checks schema-qualified method identities, not just counts',()=>{
 const a={key:'A::Tests::check'},b={key:'B::Tests::check'};
 assert.equal(compareTests([a,b],[a,{key:'A::Different::check'}]).verified,false);
 assert.deepEqual(compareTests([a,b],[a]).missing,[b]);assert.equal(compareTests([a,b],[a,b]).verified,true);
 assert.equal(compareTests([],[a]).verified,false,'an empty configured database is not proof of remote test discovery');
});
