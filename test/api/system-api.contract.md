# M01 System API Contract

HTTP:
- `POST /api/results/:domain/compile`
- `GET /api/results/:domain/system`
- `GET /api/results/:domain/pages`
- `GET /api/results/:domain/pages/:pageId`
- `GET /api/results/:domain/archetypes`
- `GET /api/results/:domain/archetypes/:archetypeId`
- `GET /api/results/:domain/components`
- `GET /api/results/:domain/components/:componentId`
- `GET /api/results/:domain/preview/:pageId`

MCP:
- `compile_site_system`
- `get_site_system`
- `list_site_pages`
- `get_site_page`
- `list_archetypes`
- `get_archetype`
- `list_components`
- `get_component`

All domain paths must be resolved beneath `exports/` and identifiers must be resolved through the compiled manifest rather than interpolated as filesystem paths.
