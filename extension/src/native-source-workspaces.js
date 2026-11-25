'use strict';
const { registerWorkspaces } = require('./jade-workspaces');
const {NativeSourceProvider}=require('./NativeSourceProvider');
const {isDeepStrictEqual}=require('node:util');

function createSemanticWorkspaceTransport(workspace, client) {
  let prepared, activeRequest, activeClient, scope;
  const projectFor = config => {
    const roots = config.workspaceRoots;
    const root = config.cwd || (roots?.length === 1 ? roots[0] : undefined);
    const folder = workspace.folders().find(value => value.uri.fsPath === root);
    if (!folder || config.sourceFormat !== 'jox') throw Error('Scratch Pad has no configured JOX project binding.');
    return workspace.project(folder);
  };
  return {
    client: {
      workingJadeGitCapability: (config) => projectFor(config).provider.client.workingJadeGitCapability(config),
      request(command, body, ...args) {
        if (command !== 'workspace.run') {
          if (command === 'cancel' && activeRequest?.id === body.operationId) {
            try { return activeClient.request(command, body, args[0], args[1], activeRequest.client); }
            catch (error) { return { promise: Promise.reject(error) }; }
          }
          if(command==='cancel')return{promise:Promise.reject(Error('The original Scratch request is no longer active.'))};
          return client.request(command, body, ...args);
        }
        const project = projectFor(body.config);
        scope?.validate();
        const binding = scope?.provider.binding();
        if (!prepared || prepared.project !== project || prepared.schema !== body.config.schema ||
            prepared.generation !== binding?.generation || prepared.client !== scope?.client || prepared.client.client !== prepared.connection)
          throw Error('Scratch Pad source selection changed before execution. Retry the operation.');
        const { cwd, ...config } = body.config;
        activeClient=prepared.client;
        activeRequest = activeClient.request(command, { ...body, config, cwd: project.folder.uri.fsPath, code: body.sourceText,
          sourceSnapshot: prepared.sourceSnapshot, semanticSelection: { entityIds: [prepared.entityId] } }, args[0], args[1], prepared.connection);
        return activeRequest;
      }
    },
    async beforeOperation() {
      if (workspace.executing) throw Error('Another Jade Working operation is running.');
      workspace.executing = true;
      try { await workspace.beforeOperation?.(); }
      catch (error) { workspace.releaseExecution(); throw error; }
    },
    async afterOperation() {
      const owned=scope;scope=undefined;prepared=undefined;activeRequest=undefined;activeClient=undefined;
      const failures=[];
      try{await owned?.provider?.closeProject();}catch(error){failures.push(error);}
      try{await owned?.client.dispose();}catch(error){failures.push(error);}
      workspace.releaseExecution();
      if(failures.length)throw new AggregateError(failures,'Scratch cleanup failed: '+failures.map(error=>error.message).join('; '));
    },
    async prepareSource(config, _progress, token) {
      const project = projectFor(config);
      await workspace.saveDirty(project, token);
      await project.provider.sourceOperation;
      if(token?.isCancellationRequested)throw Object.assign(Error('Source operation cancelled.'),{cancelled:true});
      const configuration=structuredClone(project.provider.config),parent=project.provider.client;
      const validate=()=>{if(workspace.project(project.folder)!==project||project.provider.client!==parent||parent.disposed||!isDeepStrictEqual(project.provider.config,configuration))throw Error('Scratch Pad project configuration or source session changed before execution. Retry.');};
      validate();
      const owned=parent.fork();scope={client:owned,validate};
      const provider=new NativeSourceProvider({client:owned,config:{...configuration,schema:config.schema},projectRoot:project.folder.uri.fsPath,validateContext:validate});
      scope.provider=provider;
      await provider.capability();
      const location=configuration=>provider.request('working.location',{cwd:project.folder.uri.fsPath,config:configuration,...(configuration.workingMode==='git-first'?{checkoutOnly:true}:{})},token);
      const reviewed=await location(configuration);
      if(typeof reviewed.working?.identity!=='string'||!reviewed.working.identity)throw Error('Scratch Pad native Working identity is missing. Retry.');
      const target=reviewed.working;
      if(typeof target.root!=='string'||!target.root||typeof target.installPath!=='string'||!target.installPath)throw Error('Scratch Pad native Working target is incomplete. Retry.');
      // Bind native preparation to the reviewed directory; checkout discovery also enforces its generation.
      provider.config={...provider.config,workingDatabaseDirectory:target.root,installPath:target.installPath,
        ...(reviewed.workingMode==='git-first'||target.workingMode==='git-first'||configuration.workingMode==='git-first'?{workingMode:'git-first'}:{})};
      const snapshot = await provider.prepare(token);
      if (!provider.flags.deploymentFromSavedSnapshot || !provider.flags.nativeScratch)
        throw Error('This Jade CLI does not yet support Scratch Pad execution from saved JOX source.');
      const page = await provider.query({ kind: 'schema', search: config.schema, offset: 0, limit: 100 }, token);
      const matches = page.items.filter(value => value.name === config.schema);
      if (matches.length !== 1) throw Error('The selected Scratch Pad schema was not resolved uniquely by the native provider.');
      const selected=await location(provider.config);validate();
      if(selected.working?.identity!==reviewed.working.identity)throw Error('Scratch Pad Working target changed while selecting the schema. Retry.');
      prepared = { project, schema: config.schema, entityId: matches[0].id, generation: snapshot.generation,
        client:owned, connection:provider.connection, sourceSnapshot: { provider: snapshot.provider, projectId: snapshot.projectId,
          generation: snapshot.generation, snapshotHash: snapshot.snapshotHash } };

    }
  };
}

function registerNativeSourceWorkspaces(vscode, context, workspace, client) {
  const transport = createSemanticWorkspaceTransport(workspace, client);
  return registerWorkspaces(vscode, context, { ...transport,
    configFor: (_document, scope) => ({ ...workspace.project(scope.folder).provider.config, cwd: scope.folder.uri.fsPath }),
    schemaChoices: async scope => {
      const project = await workspace.prepare(scope.folder);
      const page = await project.provider.query({ kind: 'schema', offset: 0, limit: 100 });
      return page.items.map(item => ({ name: item.name }));
    }
  });
}
module.exports = { createSemanticWorkspaceTransport, registerNativeSourceWorkspaces };
