'use strict';
const { registerWorkspaces } = require('./jade-workspaces');

function createSemanticWorkspaceTransport(workspace, client) {
  let prepared, activeRequest, activeClient;
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
        const binding = project.provider.binding();
        if (!prepared || prepared.project !== project || prepared.schema !== body.config.schema ||
            prepared.generation !== binding.generation || prepared.client !== project.provider.client || prepared.client.client !== prepared.connection)
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
    async afterOperation() { prepared = undefined; activeRequest = undefined; activeClient = undefined; workspace.releaseExecution(); },
    async prepareSource(config, _progress, token) {
      const project = projectFor(config);
      await workspace.saveDirty(project, token);
      const snapshot = await project.provider.prepare(token);
      if (!project.provider.flags.deploymentFromSavedSnapshot || !project.provider.flags.nativeScratch)
        throw Error('This Jade CLI does not yet support Scratch Pad execution from saved JOX source.');
      const page = await project.provider.query({ kind: 'schema', search: config.schema, offset: 0, limit: 100 }, token);
      const matches = page.items.filter(value => value.name === config.schema);
      if (matches.length !== 1) throw Error('The selected Scratch Pad schema was not resolved uniquely by the native provider.');
      prepared = { project, schema: config.schema, entityId: matches[0].id, generation: snapshot.generation,
        client:project.provider.client, connection:project.provider.connection, sourceSnapshot: { provider: snapshot.provider, projectId: snapshot.projectId,
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
