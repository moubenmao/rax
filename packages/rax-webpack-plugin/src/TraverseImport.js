import * as babylon from 'babylon';
import traverse from 'babel-traverse';
import * as types from 'babel-types';
import generate from 'babel-generator';
import codeFrame from "babel-code-frame";

/* eslint-disable new-cap */

export default function traverseImport(options, inputSource, sourceMapOption) {
  let specified; // Collector import specifiers
  let hasPlatformSpecified = false;

  const platformMap = {
    weex: 'isWeex',
    web: 'isWeb',
    node: 'isNode',
    reactnative: 'isReactNative'
  };

  function variableDeclarationMethod(name, value) {
    return types.VariableDeclaration(
      'const', [
        types.variableDeclarator(
          types.Identifier(name),
          types.BooleanLiteral(value)
        )
      ]
    );
  }

  function objectExpressionMethod(platformName) {
    const properties = [];

    Object.keys(platformMap).forEach((p) => {
      properties.push(
        types.objectProperty(
          types.Identifier(platformMap[p]),
          types.booleanLiteral(p === platformName)
        )
      );
    });

    return types.objectExpression(properties);
  }

  try {
    let ast = babylon.parse(inputSource, {
      sourceType: 'module',
      plugins: [
        '*',
      ]
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      err.lineNumber = err.loc.line;
      err.column = err.loc.column + 1;

      // remove trailing "(LINE:COLUMN)" acorn message and add in esprima syntax error message start
      err.message = "Line " + err.lineNumber + ": " + err.message.replace(/ \((\d+):(\d+)\)$/, "") +
      // add codeframe
      "\n\n" +
      codeFrame(code, err.lineNumber, err.column, { highlightCode: true });
    }

    throw err;
  }

  traverse(ast, {
    enter() {
      specified = new Array();

      if (typeof platformMap[options.platform] !== 'undefined') {
        hasPlatformSpecified = true;
      }
    },
    // Support commonjs method `require`
    CallExpression(path) {
      let { node } = path;

      if (
        hasPlatformSpecified &&
        node.callee.name === 'require' &&
        node.arguments[0] &&
        -1 !== options.name.indexOf(node.arguments[0].value)
      ) {
        path.replaceWith(objectExpressionMethod(options.platform));
      }
    },
    ImportDeclaration(path) {
      let { node } = path;

      if (-1 !== options.name.indexOf(node.source.value)) {
        node.specifiers.forEach(spec => {
          specified.push({
            local: spec.local.name,
            imported: spec.imported.name
          });
        });

        if (hasPlatformSpecified) {
          specified.forEach(specObj => {
            let newNodeInit = specObj.imported === platformMap[options.platform] ?
              true : false;
            let newNode = variableDeclarationMethod(
              specObj.imported,
              newNodeInit
            );

            path.insertAfter(newNode);

            // Support custom alise import:
            // import { isWeex as iw } from 'universal-env';
            // const isWeex = true;
            // const iw = true;
            if (specObj.imported !== specObj.local) {
              newNode = variableDeclarationMethod(
                specObj.local,
                newNodeInit
              );
              path.insertAfter(newNode);
            }
          });

          path.remove();
        }
      }
    }
  });

  return generate(ast, Object.assign({
    sourceMaps: true,
    sourceFileName: 'inline',
    sourceMapTarget: 'inline',
  }, sourceMapOption), inputSource);
};
