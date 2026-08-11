# Figma Variables Sync

## Testing against real Figma state

When a change depends on real Figma variable/collection state (descriptions, scopes, codeSyntax, hiddenFromPublishing, naming collisions, etc.), set that state via the Figma MCP `use_figma` tool first, rather than walking through manual UI steps in the Variables panel — it's faster and repeatable. Example: `variable.description = "..."`, `variable.scopes = [...]`, `variable.setVariableCodeSyntax('WEB', '...')`, `variable.hiddenFromPublishing = true`, then run the plugin's export/import and inspect the result. Fall back to manual UI steps only for things the API can't set (or when the user wants to verify by eye in the Figma UI itself).
