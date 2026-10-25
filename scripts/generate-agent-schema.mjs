import ts from 'typescript'
import prettier from 'prettier'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const filename = path.join(root, 'packages/editor-core/src/agent-edits.ts')
const configPath = ts.findConfigFile(path.dirname(filename), ts.sys.fileExists)
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath))
const program = ts.createProgram([filename], parsed.options)
const checker = program.getTypeChecker()
const source = program.getSourceFile(filename)
const declaration = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === 'AgentEdit')
const definitions = {}
const seen = new Map()
function schema(type) {
  if (type.flags & ts.TypeFlags.StringLiteral) return { const: type.value }
  if (type.flags & ts.TypeFlags.NumberLiteral) return { const: type.value }
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: type.intrinsicName === 'true' }
  if (type.flags & ts.TypeFlags.String) return { type: 'string' }
  if (type.flags & ts.TypeFlags.Number) return { type: 'number' }
  if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' }
  if (type.flags & ts.TypeFlags.Null) return { type: 'null' }
  if (seen.has(type)) return { $ref: `#/$defs/${seen.get(type)}` }
  const key = `T${seen.size}`
  seen.set(type, key)
  if (type.isUnion()) {
    definitions[key] = { anyOf: type.types.filter((entry) => !(entry.flags & ts.TypeFlags.Undefined)).map(schema) }
    return { $ref: `#/$defs/${key}` }
  }
  if (checker.isArrayType(type)) {
    definitions[key] = { type: 'array', items: schema(checker.getTypeArguments(type)[0]) }
    return { $ref: `#/$defs/${key}` }
  }
  if (!(type.flags & ts.TypeFlags.Object)) {
    definitions[key] = {}
    return {}
  }
  const result = { type: 'object', properties: {}, additionalProperties: false }
  definitions[key] = result
  const required = []
  for (const property of checker.getPropertiesOfType(type)) {
    if (property.name.startsWith('__@')) continue
    result.properties[property.name] = schema(checker.getTypeOfSymbolAtLocation(property, declaration))
    if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name)
  }
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String)
  if (index) result.additionalProperties = schema(index)
  if (required.length) result.required = required
  return { $ref: `#/$defs/${key}` }
}
const operation = schema(checker.getTypeAtLocation(declaration))
const output = await prettier.format(JSON.stringify({ operation, $defs: definitions }), { ...(await prettier.resolveConfig(filename)), parser: 'json' })
const destination = path.join(root, 'packages/editor-core/src/agent-edit-schema.json')
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('Run pnpm mcp:schema')
} else fs.writeFileSync(destination, output)
