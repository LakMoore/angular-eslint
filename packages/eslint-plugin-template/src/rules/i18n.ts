import {
  createESLintRule,
  getTemplateParserServices,
} from '../utils/create-eslint-rule';

const TEXT_TYPE_NAMES = ['Text', 'BoundText', 'Icu'];
const ATTRIB_I18N = 'i18n';
const DEFAULT_IGNORE_ATTRIBUTES = [
  'class',
  'style',
  'color',
  'svgIcon',
  'href',
  'src',
  'id',
  'lang',
  'charset',
  'height',
  'width',
  'target',
  'type',
  'colspan',
  'uiSref',
  'uiSrefActive',
  'ui-view',
  'xmlns',
  'stroke-width',
  'stroke',
  'fill',
  'viewBox',
  'tabindex',
  'formControlName',
];

type Options = [
  {
    checkId?: boolean;
    checkText?: boolean;
    checkAttributes?: boolean;
    ignoreAttributes?: string[];
  },
];

const defaultOptions = {
  checkId: true,
  checkText: true,
  checkAttributes: true,
  ignoreAttributes: [''],
};

export type MessageIds =
  | 'i18nId'
  | 'i18nText'
  | 'i18nAttrib'
  | 'i18nIdOnAttrib'
  | 'i18nSuggestIgnore';
export const RULE_NAME = 'i18n';

export default createESLintRule<Options, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Helps to ensure following best practices for i18n. ' +
        'Checks for missing i18n attributes on elements and non-ignored attributes ' +
        'containing text. Can also highlight tags that do not use Custom ID (@@) feature. ' +
        'Default Config = ' +
        JSON.stringify(defaultOptions),
      category: 'Best Practices',
      recommended: false,
      // url: '',  // Not sure why we are excluding this, it is in the docs at eslint
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          checkId: {
            type: 'boolean',
          },
          checkText: {
            type: 'boolean',
          },
          checkAttributes: {
            type: 'boolean',
          },
          ignoreAttributes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      i18nId:
        'Missing custom message identifier. ' +
        'For more information visit https://angular.io/guide/i18n#use-a-custom-id-with-a-description',
      i18nIdOnAttrib:
        "Missing custom message identifier on attribute '{{attribName}}'. " +
        'For more information visit https://angular.io/guide/i18n#use-a-custom-id-with-a-description',
      i18nText:
        'Each element containing text node should have an i18n attribute. ' +
        'See https://angular.io/guide/i18n',
      i18nAttrib:
        "Attribute '{{attribName}}' has no corresponding i18n attribute. " +
        'See https://angular.io/guide/i18n#translate-attributes',
      i18nSuggestIgnore:
        "Add the attribute name '{{attribName}}' to the ignoreAttributes option in the eslint config.",
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const parserServices = getTemplateParserServices(context);
    const sourceCode = context.getSourceCode();
    const { checkId, checkText, checkAttributes, ignoreAttributes } = options;

    // build a big list of attributes to ignore
    const allIgnoredAttribs: string[] = DEFAULT_IGNORE_ATTRIBUTES;
    if (ignoreAttributes) {
      allIgnoredAttribs.push(...ignoreAttributes);
    }

    function isSizeOrNumber(value: string) {
      let temp = value;
      if (temp.endsWith('px')) {
        temp = temp.substr(0, temp.length - 2);
      }
      return String(Number(temp)) === String(temp);
    }

    function checkNode(node: any, name: string): void {
      const loc = parserServices.convertNodeSourceSpanToLoc(node.sourceSpan);
      const startIndex = sourceCode.getIndexFromLoc(loc.start);
      let insertIndex = startIndex + 1;
      if (!name) {
        console.log(node);
      } else {
        insertIndex += name.length;
      }

      // Check all of the text attributes on the element
      node.attributes.forEach((attrib: any) => {
        if (attrib.i18n) {
          if (checkId && !attrib.i18n.customId) {
            // i18n attribute does not contain '@@'
            // see https://angular.io/guide/i18n#use-a-custom-id-with-a-description
            context.report({
              messageId: 'i18nIdOnAttrib',
              loc,
              data: {
                attribName: attrib.name,
              },
            });
          }
        } else {
          if (
            checkAttributes &&
            attrib.value &&
            typeof attrib.value === 'string' &&
            attrib.value.length > 0 &&
            attrib.value !== 'true' &&
            attrib.value !== 'false' &&
            !isSizeOrNumber(attrib.value) &&
            !attrib.name.startsWith(':xml') &&
            !allIgnoredAttribs.includes(attrib.name)
          ) {
            context.report({
              messageId: 'i18nAttrib',
              loc,
              data: {
                attribName: attrib.name,
              },
              fix: fixer =>
                fixer.replaceTextRange(
                  [insertIndex, insertIndex],
                  ' ' + ATTRIB_I18N + '-' + attrib.name,
                ),
              suggest: [
                {
                  messageId: 'i18nSuggestIgnore',
                  data: {
                    attribName: attrib.name,
                  },
                  fix: () => null,
                },
              ],
            });
          }
        }
      });

      if (node.i18n) {
        // if this element already has i18n
        if (checkId) {
          if (!node.i18n.customId) {
            // i18n attribute does not contain '@@'
            // see https://angular.io/guide/i18n#use-a-custom-id-with-a-description
            context.report({
              messageId: 'i18nId',
              loc,
            });
          }
        }
      } else {
        // No i18n attribute here!

        if (checkText) {
          // Attempted to check for child nodes that also include i18n
          // however these throw a template parser error before the linter
          // is allowed to run, so no need!

          // Need to check the children
          if (
            node.children &&
            node.children.some((child: any) =>
              TEXT_TYPE_NAMES.includes(child.type),
            )
          ) {
            // If at least one child is a text node then we probably need i18n
            context.report({
              messageId: 'i18nText',
              loc,
              fix: fixer =>
                fixer.replaceTextRange(
                  [insertIndex, insertIndex],
                  ' ' + ATTRIB_I18N,
                ),
            });
          }
        }
      }
    }

    return parserServices.defineTemplateBodyVisitor({
      Element(node: any) {
        checkNode(node, node.name);
      },
      Template(node: any) {
        checkNode(node, node.tagName);
      },
    });
  },
});
