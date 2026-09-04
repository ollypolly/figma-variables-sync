# Figma Variables Sync

## Comments

Err heavily toward zero comments. Default to none. Code should read clearly enough from naming and structure alone that a comment isn't needed to explain it.

If you feel the pull to add one, treat that as a signal first, not a task to fulfill: it usually means a function/variable name isn't precise enough, or the logic has a shape (a non-obvious ordering dependency, a subtlety a reader would trip on) that's better solved by restructuring the code than by narrating it. Try renaming or restructuring before reaching for a comment.

Only write one when a genuine WHY survives that attempt — a hidden constraint, a workaround for a specific external bug, an ordering dependency that can't be made self-evident through naming alone. Never write comments that restate WHAT the code does.

This applies equally to test files. A one-line summary on top of a function that just restates its name/signature is WHAT, not WHY — delete it. A comment explaining why a mock is sequenced a certain way (call order, which value comes back when) is almost always better solved by a descriptive variable name (`liveFigmaContent`, `mergedResult`, `staleSnapshot`) than a paragraph of prose walking through the call sequence.

Never reference planning-doc terminology in code comments (e.g. "the 3a decision", "same mechanism 3c/3d use", "Slice 3"). Plan files under `plans/` are working documents and get deleted once their work ships — a comment that only makes sense next to the plan orphans itself the moment that happens. Describe the actual behavior/reasoning in the comment instead.

## Testing against real Figma state

When a change depends on real Figma variable/collection state (descriptions, scopes, codeSyntax, hiddenFromPublishing, naming collisions, etc.), set that state via the Figma MCP `use_figma` tool first, rather than walking through manual UI steps in the Variables panel — it's faster and repeatable. Example: `variable.description = "..."`, `variable.scopes = [...]`, `variable.setVariableCodeSyntax('WEB', '...')`, `variable.hiddenFromPublishing = true`, then run the plugin's export/import and inspect the result. Fall back to manual UI steps only for things the API can't set (or when the user wants to verify by eye in the Figma UI itself).
