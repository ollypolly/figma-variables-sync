// Shared fake for the subset of the Figma Plugin API that exportToDtcg/importFromDtcg
// touch, so tests can fabricate collections/variables without a real Figma runtime.
export function createMockFigma() {
  const collections: any[] = [];
  const variables: any[] = [];
  const remoteCollections: any[] = [];
  const remoteVariables: any[] = [];
  let nextCollectionId = 1;
  let nextVariableId = 1;
  let nextRemoteId = 1;

  const figmaMock: any = {
    variables: {
      getLocalVariableCollections() {
        return collections;
      },
      getLocalVariables() {
        return variables;
      },
      getVariableCollectionById(id: string) {
        return collections.find((c) => c.id === id) || remoteCollections.find((c) => c.id === id) || null;
      },
      getVariableById(id: string) {
        return variables.find((v) => v.id === id) || remoteVariables.find((v) => v.id === id) || null;
      },
      async getVariableByIdAsync(id: string) {
        return this.getVariableById(id);
      },
      // Simulates a variable from an external library — resolvable by ID (Figma still
      // knows about it), but absent from getLocalVariables(), the way a variable from a
      // disconnected/unpublished library shows up.
      createRemoteVariable(name: string, collectionName: string) {
        const remoteId = nextRemoteId++;
        let col = remoteCollections.find((c) => c.name === collectionName);
        if (!col) {
          col = { id: `remote-col-${remoteId}`, name: collectionName, remote: true };
          remoteCollections.push(col);
        }
        const newVar = { id: `remote-var-${remoteId}`, name, variableCollectionId: col.id, remote: true };
        remoteVariables.push(newVar);
        return newVar;
      },
      createVariableCollection(name: string) {
        const id = `col-${nextCollectionId++}`;
        const newCol = {
          id,
          name,
          hiddenFromPublishing: false,
          modes: [{ modeId: `${id}-mode-1`, name: "Mode 1" }],
          renameMode(modeId: string, name: string) {
            const m = this.modes.find((mode: any) => mode.modeId === modeId);
            if (m) m.name = name;
          },
          addMode(name: string) {
            const modeId = `${id}-mode-${this.modes.length + 1}`;
            this.modes.push({ modeId, name });
            return modeId;
          },
          remove() {
            const idx = collections.indexOf(this);
            if (idx > -1) collections.splice(idx, 1);
            for (let i = variables.length - 1; i >= 0; i--) {
              if (variables[i].variableCollectionId === this.id) variables.splice(i, 1);
            }
          },
        };
        collections.push(newCol);
        return newCol;
      },
      createVariable(name: string, collectionId: string, resolvedType: string) {
        const id = `var-${nextVariableId++}`;
        const newVar = {
          id,
          name,
          variableCollectionId: collectionId,
          resolvedType,
          valuesByMode: {} as Record<string, any>,
          description: "",
          hiddenFromPublishing: false,
          scopes: ["ALL_SCOPES"] as string[],
          codeSyntax: {} as Record<string, string>,
          setValueForMode(modeId: string, value: any) {
            this.valuesByMode[modeId] = value;
          },
          setVariableCodeSyntax(platform: string, value: string) {
            this.codeSyntax[platform] = value;
          },
          removeVariableCodeSyntax(platform: string) {
            delete this.codeSyntax[platform];
          },
          remove() {
            const idx = variables.indexOf(this);
            if (idx > -1) variables.splice(idx, 1);
          },
        };
        variables.push(newVar);
        return newVar;
      },
    },
  };

  return { figmaMock, collections, variables };
}
