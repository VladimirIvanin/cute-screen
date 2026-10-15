// Structural wrapping is independent of line width and never removes comments.
export default {
  rules: {
    'structural-lines': {
      meta: {
        type: 'layout',
        fixable: 'whitespace',
        schema: [],
        messages: { newline: 'Keep each {{part}} on its own line.' },
      },
      create(context) {
        const source = context.sourceCode

        function breakBetween(
          previous,
          next,
          part,
        ) {
          if (
            !previous ||
            !next ||
            previous.loc.end.line !== next.loc.start.line
          ) return
          context.report({
            loc: next.loc,
            messageId: 'newline',
            data: { part },
            fix(fixer) {
              const gap = source.text.slice(previous.range[1], next.range[0])
              return /^\s*$/u.test(gap)
                ? fixer.replaceTextRange([previous.range[1], next.range[0]], '\n')
                : fixer.insertTextBefore(next, '\n')
            },
          })
        }

        function wrapItems(
          items,
          part,
          close = false,
        ) {
          if (items.length < 2) return
          for (const item of items) {
            const first = source.getFirstToken(item)
            breakBetween(source.getTokenBefore(first), first, part)
          }
          if (close) {
            const last = items.at(-1)
            const closing = source.getTokenAfter(last, (token) => token.value !== ',')
            breakBetween(source.getTokenBefore(closing), closing, part)
          }
        }

        function wrapCondition(node) {
          const logical = []
          function collect(expression) {
            if (expression.type !== 'LogicalExpression') return
            logical.push(expression)
            collect(expression.left)
            collect(expression.right)
          }
          collect(node.test)
          if (logical.length < 2) return
          for (const expression of logical) {
            const operator = source.getTokenAfter(expression.left, (token) => token.value === expression.operator)
            breakBetween(operator, source.getTokenAfter(operator), 'condition')
          }
          const opening = source.getTokenBefore(node.test, (token) => token.value === '(')
          const closing = source.getTokenAfter(node.test, (token) => token.value === ')')
          breakBetween(opening, source.getTokenAfter(opening), 'condition')
          breakBetween(source.getTokenBefore(closing), closing, 'condition')
        }

        function indentHeritage(node) {
          const base = source.lines[node.loc.start.line - 1].match(/^\s*/u)[0]
          for (const heritage of node.extends) {
            const token = source.getFirstToken(heritage)
            const start = source.text.lastIndexOf('\n', token.range[0] - 1) + 1
            const prefix = source.text.slice(start, token.range[0])
            if (!/^\s*$/u.test(prefix) || prefix === `${base}    `) continue
            context.report({
              loc: token.loc,
              messageId: 'newline',
              data: { part: 'indented base interface' },
              fix: (fixer) => fixer.replaceTextRange([start, token.range[0]], `${base}    `),
            })
          }
        }

        function wrapStatements(items) {
          for (let index = 1; index < items.length; index += 1) {
            breakBetween(source.getLastToken(items[index - 1]), source.getFirstToken(items[index]), 'statement')
          }
        }

        return {
          Program: (node) => wrapStatements(node.body),
          BlockStatement: (node) => wrapStatements(node.body),
          SwitchCase: (node) => wrapStatements(node.consequent),
          ImportDeclaration(node) {
            wrapItems(node.specifiers.filter((item) => item.type === 'ImportSpecifier'), 'import', true)
          },
          ExportNamedDeclaration(node) {
            wrapItems(node.specifiers, 'export', true)
          },
          FunctionDeclaration(node) {
            wrapItems(node.params, 'parameter', true)
          },
          FunctionExpression(node) {
            wrapItems(node.params, 'parameter', true)
          },
          TSDeclareFunction(node) {
            wrapItems(node.params, 'parameter', true)
          },
          TSInterfaceDeclaration(node) {
            if (node.extends.length >= 2) {
              const keyword = source.getTokenBefore(node.extends[0])
              breakBetween(source.getTokenBefore(keyword), keyword, 'inheritance clause')
            }
            wrapItems(node.extends, 'base interface')
            if (node.extends.length >= 2) indentHeritage(node)
          },
          IfStatement: wrapCondition,
          WhileStatement: wrapCondition,
          DoWhileStatement: wrapCondition,
        }
      },
    },
  },
}
