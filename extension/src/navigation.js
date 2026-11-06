'use strict';
const vscode = require('vscode');
const { sourcePosition } = require('./source_symbols');
const {classSections}=require('./class-view-model');

function registerNavigation(context,language) {
  const selector = { language: 'jade-nz', scheme: 'file' };
  const model=document=>language.model(document);
  function kind(item) {
    return item.kind === 'class' ? vscode.SymbolKind.Class : item.kind === 'method' ? vscode.SymbolKind.Method : vscode.SymbolKind.Property;
  }
  function range(document, item) {
    return new vscode.Range(document.positionAt(item.start), document.positionAt(item.end));
  }
  function selection(document, item) {
    return new vscode.Range(document.positionAt(item.selection), document.positionAt(item.selection + item.name.length));
  }
  function cachedSelection(source,item){const start=sourcePosition(source,item.selection),end=sourcePosition(source,item.selection+item.name.length);return new vscode.Range(start.line,start.character,end.line,end.character);}
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        return classSections(document.getText(),document.uri.toString()).map(cls => {
          const symbol = new vscode.DocumentSymbol(cls.name, `subclassOf ${cls.parent}`, kind(cls), range(document, cls), selection(document, cls));
          symbol.children = cls.groups.filter(group=>group.label!=='Inheritance').map(group=>{
            const first=Math.min(...group.items.map(item=>item.start)),last=Math.max(...group.items.map(item=>item.end));
            const container=new vscode.DocumentSymbol(group.label,String(group.items.length),vscode.SymbolKind.Namespace,new vscode.Range(document.positionAt(first),document.positionAt(last)),selection(document,group.items[0]));
            container.children=group.items.map(item=>new vscode.DocumentSymbol(item.name,item.detail||'',item.kind==='constant'?vscode.SymbolKind.Constant:kind(item),range(document,item),selection(document,item)));return container;
          });
          return symbol;
        });
      }
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
        if (!wordRange) return undefined;
        if(!await language.ready(document,token))return;
        const current=model(document),reference=language.index.project.referenceAt(current,document.offsetAt(position));
        const target=reference?.symbol;if(!target?.model||token?.isCancellationRequested)return;
        return new vscode.Location(vscode.Uri.parse(target.model.uri),cachedSelection(target.model,target));
      }
    }),
    vscode.languages.registerWorkspaceSymbolProvider({
      async provideWorkspaceSymbols(query, token) {
        const results = [],seen=new Set();if(!await language.ready(undefined,token))return results;
        for(const entries of language.index.project.groups.values()){
          if(token?.isCancellationRequested)break;const cls=language.index.project.type(entries[0].cls.name,entries[0].model.schema);if(!cls?.model)continue;
          for(const item of [cls,...cls.members]){if(!item.model||!item.name.toLowerCase().includes(query.toLowerCase()))continue;
            const id=item.model.uri+'::'+item.selection+'::'+item.name;if(seen.has(id))continue;seen.add(id);
            results.push(new vscode.SymbolInformation(item.name,kind(item),item===cls?'':cls.name,new vscode.Location(vscode.Uri.parse(item.model.uri),cachedSelection(item.model,item))));
          }
        }
        return results;
      }
    })
  );
}

module.exports = { registerNavigation };
