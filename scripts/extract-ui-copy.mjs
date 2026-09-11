import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Explicit source files only: this codemod never visits server code, values,
// classes, route names, status enums, or template expressions with interpolation.
// Run: node scripts/extract-ui-copy.mjs src/components/settings.tsx [...files]
const filenames = process.argv.slice(2);
if (!filenames.length)
  throw new Error('Pass the component files whose static display copy should be extracted.');
const project = process.cwd();
const componentRoot = path.join(project, 'src', 'components') + path.sep;
const catalogPath = path.join(project, 'src', 'lib', 'i18n', 'ui.ts');
const displayProps = new Set([
  'label',
  'title',
  'subtitle',
  'placeholder',
  'aria-label',
  'detail',
  'action',
  'hint',
  'submit',
]);

function sourceFile(filename, text, kind = ts.ScriptKind.TSX) {
  return ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind);
}
function literalObject(node) {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
    return literalObject(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (!ts.isObjectLiteralExpression(node))
    throw new Error('The UI catalog must contain only nested literal objects and strings.');
  return Object.fromEntries(
    node.properties.map((property) => {
      if (
        !ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      )
        throw new Error('Unsupported UI catalog property.');
      return [property.name.text, literalObject(property.initializer)];
    }),
  );
}
let catalog = {};
try {
  const parsed = sourceFile(catalogPath, await readFile(catalogPath, 'utf8'), ts.ScriptKind.TS);
  for (const statement of parsed.statements)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'ui' &&
          declaration.initializer
        )
          catalog = literalObject(declaration.initializer);
      }
    }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function camelCase(value) {
  const words = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[A-Za-z0-9]+/g) || ['copy'];
  const result = words
    .slice(0, 9)
    .map((word, index) =>
      index ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase(),
    )
    .join('');
  return /^\d/.test(result) ? `copy${result}` : result;
}
function keyFor(group, value) {
  catalog[group] ??= {};
  const found = Object.entries(catalog[group]).find(([, existing]) => existing === value);
  if (found) return `ui.${group}.${found[0]}`;
  const base = camelCase(value);
  let key = base;
  let suffix = 2;
  while (key in catalog[group]) key = `${base}${suffix++}`;
  catalog[group][key] = value;
  return `ui.${group}.${key}`;
}

// TypeScript's own JSX transform resolves entities and whitespace exactly as
// the application compiler does. Reading the emitted literal avoids fragile
// regex transformations and changes to accessible names/visible spacing.
function renderedLiteral(fragment, attribute = false) {
  const input = attribute
    ? `const copy = <span title=${fragment}/>;`
    : `const copy = <span>${fragment}</span>;`;
  const output = ts.transpileModule(input, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const parsed = sourceFile('copy.js', output, ts.ScriptKind.JS);
  const call = parsed.statements[0].declarationList.declarations[0].initializer;
  const literal = attribute ? call.arguments[1].properties[0].initializer : call.arguments[2];
  if (!literal) return '';
  if (!ts.isStringLiteralLike(literal)) throw new Error('Expected a static JSX display string.');
  return literal.text;
}

function isDisplayExpression(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isConditionalExpression(parent)) {
      if (parent.condition === current) return false;
    } else if (ts.isBinaryExpression(parent)) {
      const kind = parent.operatorToken.kind;
      if (
        ![
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
        ].includes(kind)
      )
        return false;
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === current) return false;
    } else if (ts.isParenthesizedExpression(parent)) {
      // Continue through presentation-only expression wrappers.
    } else if (ts.isJsxExpression(parent)) {
      return !ts.isJsxAttribute(parent.parent) || displayProps.has(parent.parent.name.getText());
    } else if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
      return (
        ['notify', 'setMessage', 'setError', 'setInviteError'].includes(parent.expression.text) &&
        parent.arguments[0] === current
      );
    } else if (ts.isPropertyAssignment(parent)) {
      return (
        (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
        displayProps.has(parent.name.text) &&
        !['action', 'submit'].includes(parent.name.text) &&
        parent.initializer === current
      );
    } else return false;
    current = parent;
  }
  return false;
}

let count = 0;
const updates = [];
for (const filename of filenames) {
  const absolute = path.resolve(project, filename);
  if (!absolute.startsWith(componentRoot) || !absolute.endsWith('.tsx'))
    throw new Error('Only explicit src/components/*.tsx files are supported.');
  const original = await readFile(absolute, 'utf8');
  const parsed = sourceFile(absolute, original);
  if (parsed.parseDiagnostics.length)
    throw new Error(`Fix component syntax before extracting ${filename}.`);
  const group = camelCase(path.basename(filename, '.tsx'));
  const changes = [];
  function replace(node, text) {
    changes.push({ start: node.getStart(parsed), end: node.end, text });
  }
  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = original.slice(node.pos, node.end);
      const rendered = renderedLiteral(raw);
      if (rendered.trim()) {
        const text = rendered.trim();
        const leading = rendered.match(/^\s*/)[0];
        const trailing = rendered.match(/\s*$/)[0];
        const replacement = `${leading ? `{${JSON.stringify(leading)}}` : ''}{${keyFor(group, text)}}${trailing ? `{${JSON.stringify(trailing)}}` : ''}`;
        changes.push({ start: node.pos, end: node.end, text: replacement });
      }
      return;
    }
    if (
      ts.isJsxAttribute(node) &&
      displayProps.has(node.name.getText(parsed)) &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        const value = renderedLiteral(node.initializer.getText(parsed), true);
        if (value.trim()) replace(node.initializer, `{${keyFor(group, value)}}`);
        return;
      }
      if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isStringLiteralLike(node.initializer.expression)
      ) {
        replace(node.initializer.expression, keyFor(group, node.initializer.expression.text));
        return;
      }
    }
    if (ts.isStringLiteralLike(node) && node.text.trim() && isDisplayExpression(node))
      replace(node, keyFor(group, node.text));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (!changes.length) continue;
  let next = original;
  for (const change of changes.sort((a, b) => b.start - a.start))
    next = next.slice(0, change.start) + change.text + next.slice(change.end);
  const hasImport = parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@/lib/i18n/ui',
  );
  if (!hasImport) {
    const directive = parsed.statements.find(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use client',
    );
    const insertion = directive?.end ?? 0;
    next =
      next.slice(0, insertion) + "\nimport { ui } from '@/lib/i18n/ui';\n" + next.slice(insertion);
  }
  if (sourceFile(absolute, next).parseDiagnostics.length)
    throw new Error(`Generated syntax was invalid in ${filename}; no file was changed.`);
  updates.push({ absolute, next, filename, count: changes.length });
  count += changes.length;
}
await writeFile(
  catalogPath,
  `// Static English interface copy. Dynamic contextual messages use the domain formatters.\n// Generated and maintained with scripts/extract-ui-copy.mjs; keys are stable on reruns.\nexport const ui = ${JSON.stringify(catalog, null, 2)} as const;\n`,
);
for (const update of updates) {
  await writeFile(update.absolute, update.next);
  process.stdout.write(`${update.filename}: ${update.count} display strings extracted\n`);
}
process.stdout.write(`${count} replacements; catalog: src/lib/i18n/ui.ts\n`);
