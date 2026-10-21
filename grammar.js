/**
 * @file C grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 */

// @ts-check

// Tree-sitter injects its DSL before loading this CommonJS grammar.
const { grammar, alias, choice, field, optional, prec, repeat, repeat1, seq, sym, token } =
  /** @type {typeof globalThis & typeof import('./types/treeSitterDsl')} */ (globalThis);

// oxlint-disable-next-line unicorn/prefer-module -- Tree-sitter loads this grammar as CommonJS.
const { primitiveTypeKeywords } = require('./src/grammarKeywords.cjs');

const PREC = {
  PAREN_DECLARATOR: -10,
  ASSIGNMENT: -2,
  CONDITIONAL: -1,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  INCLUSIVE_OR: 3,
  EXCLUSIVE_OR: 4,
  BITWISE_AND: 5,
  EQUAL: 6,
  RELATIONAL: 7,
  OFFSETOF: 8,
  SHIFT: 9,
  ADD: 10,
  MULTIPLY: 11,
  CAST: 12,
  SIZEOF: 13,
  UNARY: 14,
  CALL: 15,
  FIELD: 16,
  SUBSCRIPT: 17,
};

/** @type {[string, number][]} */
const BINARY_OPERATORS = [
  ['+', PREC.ADD],
  ['-', PREC.ADD],
  ['*', PREC.MULTIPLY],
  ['/', PREC.MULTIPLY],
  ['%', PREC.MULTIPLY],
  ['||', PREC.LOGICAL_OR],
  ['&&', PREC.LOGICAL_AND],
  ['|', PREC.INCLUSIVE_OR],
  ['^', PREC.EXCLUSIVE_OR],
  ['&', PREC.BITWISE_AND],
  ['==', PREC.EQUAL],
  ['!=', PREC.EQUAL],
  ['>', PREC.RELATIONAL],
  ['>=', PREC.RELATIONAL],
  ['<=', PREC.RELATIONAL],
  ['<', PREC.RELATIONAL],
  ['<<', PREC.SHIFT],
  ['>>', PREC.SHIFT],
];

const LINE_COMMENT = seq('//', /(\\+(.|\r?\n)|[^\\\n])*/);
const PRAGMA_SPACING = repeat(choice(/\s/, /\\(?:\r\n?|\n\r?)/));
const PREPROC_ARGUMENT = /\S([^/\n]|\/[^*]|\\\r?\n)*/;
const VA_ARG_KEYWORDS = choice('va_arg', '__builtin_va_arg');

// oxlint-disable-next-line unicorn/prefer-module -- This package is CommonJS, so tree-sitter loads grammar.js as CommonJS.
module.exports = Object.assign(
  grammar({
    name: 'c',

    conflicts: ($) => [
      [$._declaration_modifiers, $._empty_declaration],
      [$._statement_declaration, $._statement_declaration_modifiers],
      [$.declaration, $._declaration_modifiers],
      [$._statement_declaration, $._statement_type_definition, $._statement_declaration_modifiers],
      [$.declaration, $.type_definition, $._macro_declaration_specifiers, $._declaration_modifiers],
      [$.type_definition, $.type_specifier],
      [$.type_definition, $._macro_declaration_specifiers],
      [$._macro_declaration_specifiers, $._declaration_modifiers, $.attributed_statement, $.case_statement],
      [$._macro_declaration_specifiers, $.type_specifier, $.expression, $.macro_specifier],
      [$._macro_declaration_specifiers, $.type_specifier, $.macro_specifier],
      [$.macro_specifier, $._type_declarator],
      [$.macro_specifier, $._field_declarator],
      [$.macro_specifier, $._declarator],
      [$.macro_specifier, $._declarator, $.attributed_declarator, $.type_specifier],
      [$.macro_specifier, $._declarator, $.attributed_declarator],
      [$.macro_specifier, $.sized_type_specifier],
      [$.macro_specifier, $.type_specifier, $.sized_type_specifier],
      [$.macro_specifier, $.expression],
      [$.macro_specifier, $.type_specifier],
      [$._macro_declaration_specifiers, $.type_definition, $.type_specifier],
      [$._macro_declaration_specifiers, $.type_specifier, $.expression],
      [$._macro_declaration_specifiers, $.type_specifier],
      [$._macro_declaration_specifiers, $._declaration_modifiers, $._empty_declaration],
      [$._macro_declaration_specifiers, $._declaration_modifiers],
      [$.preproc_include_argument],
      [$._preproc_include_token, $.preproc_argument_list],
      [$._preproc_include_path, $.preproc_include_argument],
      [$.compound_statement, $.initializer_list],
      [$.comma_expression, $._initializer_element],
      [$.comma_expression, $.initializer_pair],
      [$._block_item, $._initializer_directive],
      [sym('preproc_if_in_statement'), sym('preproc_if_in_initializer_list')],
      [sym('preproc_ifdef_in_statement'), sym('preproc_ifdef_in_initializer_list')],
      [sym('preproc_else_in_statement'), sym('preproc_else_in_initializer_list')],
      [sym('preproc_elif_in_statement'), sym('preproc_elif_in_initializer_list')],
      [sym('preproc_elifdef_in_statement'), sym('preproc_elifdef_in_initializer_list')],

      [$.type_specifier, $.expression, $.va_arg_expression, $.macro_type_specifier],
      [$.va_arg_expression, $.expression],
      [$.type_definition, $._declaration_modifiers],
      [$._statement_type_definition, $._statement_declaration_modifiers],
      [$.type_definition, $._declaration_modifiers, $._empty_declaration],
      [$._statement_type_definition, $.type_specifier],
      [$.type_definition, $.type_qualifier, $.extension_expression],
      [$._statement_type_definition, $.type_qualifier, $.extension_expression],
      [$.type_definition, $.type_qualifier],
      [$._statement_type_definition, $.type_qualifier],
      [$._statement_declaration_modifiers, $._statement_empty_declaration],
      [$.declaration, $.storage_class_specifier],
      [$._statement_declaration, $.storage_class_specifier],
      [$.sized_type_specifier, $.enum_specifier],
      [$.type_specifier, $._declarator],
      [$.type_specifier, $._declarator, $.macro_type_specifier],
      [$.type_specifier, $.expression],
      [$.type_specifier, $.expression, $.macro_type_specifier],
      [$.type_specifier, $.macro_type_specifier],
      [$.type_specifier, $.sized_type_specifier],
      [$.type_specifier, $._sized_bit_int_specifier],
      [$.sized_type_specifier],
      [$._sized_bit_int_specifier],
      [$.sized_type_specifier, $._sized_bit_int_specifier],
      [$._type_declarator, $.sized_type_specifier, $._sized_bit_int_specifier],
      [$.type_qualifier, $.atomic_type_specifier],
      [$.type_definition, $._type_declarator],
      [$.type_definition, $.sized_type_specifier],
      [$.type_definition, $._sized_bit_int_specifier],
      [$.case_statement],
      [$._statement_declaration_modifiers, $._case_body_attributed_statement, $._case_label_attributes],
      [$._statement_declaration_modifiers, $.attributed_statement, $.case_statement],
      [$.enum_specifier],
      [sym('preproc_if_in_enumerator_list'), sym('preproc_if_in_enumerator_list_no_comma')],
      [sym('preproc_ifdef_in_enumerator_list'), sym('preproc_ifdef_in_enumerator_list_no_comma')],
      [sym('preproc_else_in_enumerator_list'), sym('preproc_else_in_enumerator_list_no_comma')],
      [sym('preproc_elif_in_enumerator_list'), sym('preproc_elif_in_enumerator_list_no_comma')],
      [sym('preproc_elifdef_in_enumerator_list'), sym('preproc_elifdef_in_enumerator_list_no_comma')],
      [$.type_specifier, $._old_style_parameter_list],
      [$.parameter_list, $._old_style_parameter_list],
      [$.function_declarator, $._function_declaration_declarator],
      [$.pointer_declarator],
      [$.pointer_declarator, $.abstract_pointer_declarator],
      [$.pointer_field_declarator],
      [$.pointer_type_declarator],
      [$.abstract_pointer_declarator],
      [$._top_level_item, $._top_level_statement],
      [$.type_specifier, $._top_level_expression_statement],
      [$.type_qualifier, $.extension_expression],
      [$.storage_class_specifier, $.type_specifier],
      [$.storage_class_specifier, $.type_specifier, $.expression],
      [$.storage_class_specifier, $.expression],
      [$.attributed_declarator],
      [$.attributed_declarator, $._declarator],
      [$.attributed_declarator, $._declarator, $.type_specifier],
      [$.attributed_field_declarator],
      [$.attributed_field_declarator, $._field_declarator],
      [$.attributed_type_declarator],
      [$.attributed_type_declarator, $._type_declarator],
      [$._declaration_modifiers, $._field_declaration_list_item],
      [$._declaration_specifiers],
      [$._compound_literal_storage_class_specifier, $.type_specifier],
      [$._compound_literal_constexpr_specifier, $.type_qualifier],
    ],

    externals: () => [
      sym('pragma_operator'),
      sym('preproc_arg'),
      sym('_preproc_newline'),
      sym('_preproc_lparen'),
      sym('_preproc_directive_arg'),
      sym('_preproc_function_name'),
      sym('_function_attribute_start'),
      sym('_post_type_function_attribute_start'),
      sym('_post_type_function_attribute_suffix'),
      sym('_trailing_macro_attribute_name'),
      sym('_trailing_object_declaration_start'),
      sym('_conditional_marker_ifdef'),
      sym('_conditional_marker_ifndef'),
      sym('_leading_conditional_marker_ifdef'),
      sym('_leading_conditional_marker_ifndef'),
    ],

    extras: ($) => [$.pragma_operator, /\s|\\(?:\r\n?|\n\r?)/, $.comment],

    inline: ($) => [
      $._non_identifier_type_specifier,
      $._non_macro_declaration_modifiers,
      $._unattributed_declarator,
      $._unattributed_field_declarator,
      $._unattributed_type_declarator,
      $._type_identifier,
      $._field_identifier,
      $._statement_identifier,
      $._assignment_left_expression,
      $._expression_not_binary,
    ],

    supertypes: ($) => [
      $.expression,
      $.statement,
      $._single_noncompound_statement,
      $._non_case_statement,
      $._unattributed_non_case_statement,
      $._single_non_case_statement,
      $._single_unattributed_non_case_statement,
      $._case_body_statement,
      $._case_body_unattributed_statement,
      $._case_label_tail,
      $._case_label_statement,
      $._case_label_chain_statement,
      $.type_specifier,
      $._declarator,
      $._old_style_declarator,
      $._field_declarator,
      $._type_declarator,
      $._abstract_declarator,
    ],

    word: ($) => $.identifier,

    rules: {
      translation_unit: ($) => repeat($._top_level_item),

      _top_level_item: ($) =>
        choice(
          $.function_definition,
          alias($._old_style_function_definition, $.function_definition),
          alias(sym('_conditional_function_definition'), $.function_definition),
          alias(sym('_conditional_old_style_function_definition'), $.function_definition),
          $.linkage_specification,
          $.declaration,
          alias(sym('_macro_modified_declaration'), $.declaration),
          alias(sym('_trailing_macro_modified_declaration'), $.declaration),
          alias(sym('_conditional_declaration'), $.declaration),
          $._top_level_statement,
          $.attributed_statement,
          $.type_definition,
          $._empty_declaration,
          alias(sym('preproc_if_in_header'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_header'), sym('preproc_ifdef')),
          $.preproc_include,
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_call
        ),

      _block_item: ($) =>
        choice(
          alias($._statement_function_definition, $.function_definition),
          alias($._statement_old_style_function_definition, $.function_definition),
          $.linkage_specification,
          alias($._statement_declaration, $.declaration),
          $.statement,
          alias($._statement_type_definition, $.type_definition),
          $._statement_empty_declaration,
          alias(sym('preproc_if_in_statement'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_statement'), sym('preproc_ifdef')),
          $.preproc_include,
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_call
        ),

      _header_preproc_item: ($) =>
        choice(
          $.function_definition,
          alias($._old_style_function_definition, $.function_definition),
          alias(sym('_conditional_function_definition'), $.function_definition),
          alias(sym('_conditional_old_style_function_definition'), $.function_definition),
          $.linkage_specification,
          $.declaration,
          alias(sym('_macro_modified_declaration'), $.declaration),
          alias(sym('_trailing_macro_modified_declaration'), $.declaration),
          alias(sym('_conditional_declaration'), $.declaration),
          $.statement,
          $.type_definition,
          $._empty_declaration,
          alias(sym('preproc_if_in_header'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_header'), sym('preproc_ifdef')),
          $.preproc_include,
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_call
        ),

      // Derived grammars that replace externals still need this lexical fallback. Comment-rich spacing makes the
      // lexer too large for the pinned Node Wasm optimizer; the external scanner handles those forms.
      pragma_operator: () =>
        token(
          seq(
            '_Pragma',
            PRAGMA_SPACING,
            '(',
            PRAGMA_SPACING,
            optional(choice('L', 'u8', 'u', 'U')),
            '"',
            repeat(choice(/[^\\"\r\n]/, seq('\\', choice(/[^\r\n]/, /\r\n?|\n\r?/)))),
            '"',
            PRAGMA_SPACING,
            ')'
          )
        ),

      preproc_include: ($) =>
        seq(
          preprocessor('include'),
          field('path', choice($._preproc_include_path, $.preproc_include_argument)),
          repeat(choice($.comment, $.pragma_operator)),
          sym('_preproc_newline')
        ),

      _preproc_include_path: ($) =>
        choice(
          $.string_literal,
          $.system_lib_string,
          $.identifier,
          alias($.preproc_call_expression, $.call_expression)
        ),

      preproc_include_argument: ($) => prec.dynamic(-1, seq($.identifier, repeat1($._preproc_include_segment))),

      _preproc_include_segment: ($) =>
        prec.dynamic(-1, seq(repeat(choice($.comment, $.pragma_operator)), $._preproc_include_token)),

      _preproc_include_token: ($) =>
        choice(
          $.identifier,
          $.number_literal,
          $.char_literal,
          $.string_literal,
          $.system_lib_string,
          ...BINARY_OPERATORS.map(([operator]) => operator),
          '!',
          '~',
          '(',
          ')',
          ',',
          'defined',
          token(prec(-3, /\S/))
        ),

      preproc_def: ($) =>
        seq(
          preprocessor('define'),
          field('name', $.identifier),
          repeat(choice($.comment, $.pragma_operator)),
          optional(seq(field('value', $.preproc_arg), repeat(choice($.comment, $.pragma_operator)))),
          sym('_preproc_newline')
        ),

      preproc_function_def: ($) =>
        seq(
          preprocessor('define'),
          field('name', alias(sym('_preproc_function_name'), $.identifier)),
          field('parameters', $.preproc_params),
          repeat(choice($.comment, $.pragma_operator)),
          optional(seq(field('value', $.preproc_arg), repeat(choice($.comment, $.pragma_operator)))),
          sym('_preproc_newline')
        ),

      preproc_params: ($) => seq(alias($._preproc_lparen, '('), commaSep(choice($.identifier, '...')), ')'),

      preproc_call: ($) =>
        seq(
          field('directive', $.preproc_directive),
          repeat(choice($.comment, $.pragma_operator)),
          optional(
            seq(
              field('argument', alias($._preproc_directive_arg, $.preproc_arg)),
              repeat(choice($.comment, $.pragma_operator))
            )
          ),
          sym('_preproc_newline')
        ),

      ...preprocIf('_in_header', () => sym('_header_preproc_item')),
      ...preprocIf('', () => sym('_block_item')),
      ...preprocIf('_in_statement', () => sym('_block_item')),
      ...preprocIf('_in_single_case', () => sym('_single_case_body'), 0, true),
      ...preprocIf('_in_field_declaration_list', () => sym('_field_declaration_list_item')),
      ...preprocIf('_in_enumerator_list', () => choice(seq(sym('enumerator'), ','), sym('_enumerator_directives'))),
      ...preprocIf(
        '_in_enumerator_list_no_comma',
        () =>
          choice(
            seq(optional(sym('_enumerator_directives')), sym('enumerator'), optional(sym('_enumerator_directives'))),
            sym('_enumerator_directives')
          ),
        0,
        false
      ),

      _enumerator_directives: ($) => prec.right(repeat1($.preproc_call)),

      _preproc_newline: () => token.immediate(/\r?\n/),

      _preproc_lparen: () => token.immediate(/\(/),

      preproc_arg: () => token(prec(-1, PREPROC_ARGUMENT)),

      _preproc_directive_arg: () => token(prec(-2, PREPROC_ARGUMENT)),
      preproc_directive: () => /#[ \t]*[a-zA-Z0-9]\w*/,

      _preproc_expression: ($) =>
        choice(
          $.identifier,
          alias($.preproc_call_expression, $.call_expression),
          $.number_literal,
          $.char_literal,
          $.preproc_defined,
          alias($.preproc_unary_expression, $.unary_expression),
          alias($.preproc_binary_expression, $.binary_expression),
          alias($.preproc_parenthesized_expression, $.parenthesized_expression)
        ),

      preproc_parenthesized_expression: ($) => seq('(', $._preproc_expression, ')'),

      preproc_defined: ($) =>
        choice(prec(PREC.CALL, seq('defined', '(', $.identifier, ')')), seq('defined', $.identifier)),

      preproc_unary_expression: ($) =>
        prec.left(
          PREC.UNARY,
          seq(field('operator', choice('!', '~', '-', '+')), field('argument', $._preproc_expression))
        ),

      preproc_call_expression: ($) =>
        prec(
          PREC.CALL,
          seq(field('function', $.identifier), field('arguments', alias($.preproc_argument_list, $.argument_list)))
        ),

      preproc_argument_list: ($) =>
        seq('(', commaSep(choice($._preproc_expression, $.system_lib_string, $.string_literal)), ')'),

      preproc_binary_expression: ($) => {
        return choice(
          ...BINARY_OPERATORS.map(([operator, precedence]) => {
            return prec.left(
              precedence,
              seq(
                field('left', $._preproc_expression),
                field('operator', operator),
                field('right', $._preproc_expression)
              )
            );
          })
        );
      },

      function_definition: ($) => functionDefinitionRule($, $._declaration_specifiers, false),
      _statement_function_definition: ($) => functionDefinitionRule($, $._statement_declaration_specifiers, false),
      _old_style_function_definition: ($) => functionDefinitionRule($, $._declaration_specifiers, true),
      _statement_old_style_function_definition: ($) =>
        functionDefinitionRule($, $._statement_declaration_specifiers, true),

      _old_style_declarator: ($) =>
        choice(
          alias($._old_style_function_declarator, $.function_declarator),
          alias($._old_style_pointer_declarator, $.pointer_declarator)
        ),

      _old_style_pointer_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional($.ms_based_modifier),
              optional(prec.dynamic(2, $.ms_call_modifier)),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(
                choice(
                  $.type_qualifier,
                  $.attribute_specifier,
                  prec(-1, $.ms_call_modifier),
                  $.macro_specifier,
                  $._conditional_macro_specifier
                )
              ),
              field('declarator', alias($._old_style_declarator, $._declarator))
            )
          )
        ),

      _conditional_function_definition: ($) =>
        functionDefinitionRule($, sym('_conditional_function_specifiers'), false),
      _conditional_old_style_function_definition: ($) =>
        functionDefinitionRule($, sym('_conditional_function_specifiers'), true),
      _conditional_function_specifiers: ($) =>
        seq(
          repeat($._declaration_modifiers),
          field('type', $.type_specifier),
          repeat($._non_macro_declaration_modifiers),
          $._conditional_macro_specifier,
          repeat(choice($._non_macro_declaration_modifiers, $._conditional_macro_specifier))
        ),

      declaration: ($) => declarationRule($, $._declaration_specifiers, $._declaration_modifiers),
      _statement_declaration: ($) =>
        declarationRule($, $._statement_declaration_specifiers, $._statement_declaration_modifiers),

      type_definition: ($) => typeDefinitionRule($, $._declaration_modifiers, true),
      _statement_type_definition: ($) => typeDefinitionRule($, $._statement_declaration_modifiers, false),

      _macro_modified_declaration: ($) =>
        declarationRule(
          $,
          $._macro_declaration_specifiers,
          $._non_macro_declaration_modifiers,
          false,
          $._macro_declaration_declarator
        ),

      _conditional_declaration: ($) =>
        declarationRule($, sym('_conditional_function_specifiers'), $._non_macro_declaration_modifiers, false),

      _trailing_macro_modified_declaration: ($) =>
        seq(
          sym('_trailing_object_declaration_start'),
          $._declaration_specifiers,
          field('declarator', $._trailing_macro_object_declarator),
          repeat1(alias($._trailing_macro_attribute_specifier, $.attribute_specifier)),
          ';'
        ),

      _trailing_macro_object_declarator: ($) =>
        choice($.identifier, alias($._trailing_macro_pointer_declarator, $.pointer_declarator)),

      _trailing_macro_pointer_declarator: ($) => pointerDeclaratorRule($, $._trailing_macro_object_declarator),

      _macro_declaration_specifiers: ($) => {
        const modifier = choice(
          $._non_macro_declaration_modifiers,
          alias($._macro_attribute_suffix, $.attribute_specifier)
        );
        const postModifier = choice(
          $._non_macro_declaration_modifiers,
          alias($._post_type_macro_attribute_suffix, $.attribute_specifier)
        );
        return choice(
          seq(
            choice($.storage_class_specifier, $.type_qualifier, $.ms_declspec_modifier),
            repeat($._non_macro_declaration_modifiers),
            alias($._macro_attribute_specifier, $.attribute_specifier),
            repeat(modifier),
            field('type', $._non_identifier_type_specifier),
            repeat(postModifier)
          ),
          seq(
            repeat($._non_macro_declaration_modifiers),
            field('type', choice($._non_identifier_type_specifier, $._type_identifier)),
            repeat($._non_macro_declaration_modifiers),
            alias($._post_type_macro_attribute_specifier, $.attribute_specifier),
            repeat(postModifier)
          )
        );
      },

      _type_definition_type: ($) =>
        seq(
          repeat(choice($.type_qualifier, $.macro_specifier, $._leading_conditional_macro_specifier)),
          field('type', $.type_specifier),
          repeat($.type_qualifier)
        ),
      _type_definition_declarators: ($) => commaSep1(field('declarator', $._type_declarator)),

      _declaration_modifiers: ($) =>
        choice($._non_macro_declaration_modifiers, $.macro_specifier, $._leading_conditional_macro_specifier),

      _statement_declaration_modifiers: ($) => $._non_macro_declaration_modifiers,

      _non_macro_declaration_modifiers: ($) =>
        choice(
          $.storage_class_specifier,
          $.type_qualifier,
          $.attribute_specifier,
          $.attribute_declaration,
          $.ms_declspec_modifier
        ),

      _declaration_specifiers: ($) =>
        seq(
          repeat($._declaration_modifiers),
          field('type', $.type_specifier),
          repeat($._non_macro_declaration_modifiers)
        ),

      _statement_declaration_specifiers: ($) =>
        seq(
          repeat($._statement_declaration_modifiers),
          field('type', $.type_specifier),
          repeat($._statement_declaration_modifiers)
        ),

      linkage_specification: ($) =>
        seq(
          'extern',
          field('value', $.string_literal),
          field('body', choice($.function_definition, $.declaration, $.declaration_list))
        ),

      attribute_specifier: ($) => seq(choice('__attribute__', '__attribute'), '(', $.argument_list, ')'),

      _macro_attribute_specifier: ($) => macroAttributeRule($, 'leading'),

      _post_type_macro_attribute_specifier: ($) => macroAttributeRule($, 'post-type'),

      _macro_attribute_suffix: ($) => macroAttributeRule($, 'continuation'),

      _trailing_macro_attribute_specifier: ($) => macroAttributeRule($, 'trailing'),

      _post_type_macro_attribute_suffix: ($) => macroAttributeRule($, 'post-type-continuation'),

      _macro_attribute_argument_list: ($) => {
        const argument = macroAttributeArgument($);
        return seq('(', optional(argument), repeat(seq(',', optional(argument))), ')');
      },

      attribute: ($) =>
        seq(optional(seq(field('prefix', $.identifier), '::')), field('name', $.identifier), optional($.argument_list)),

      attribute_declaration: ($) => seq('[', '[', commaSep1($.attribute), ']', ']'),

      ms_declspec_modifier: ($) => seq('__declspec', '(', repeat(seq($.identifier, optional($.argument_list))), ')'),

      ms_based_modifier: ($) => seq('__based', $.argument_list),

      ms_call_modifier: () => choice('__cdecl', '__clrcall', '__stdcall', '__fastcall', '__thiscall', '__vectorcall'),

      ms_restrict_modifier: () => '__restrict',

      ms_unsigned_ptr_modifier: () => '__uptr',

      ms_signed_ptr_modifier: () => '__sptr',

      ms_unaligned_ptr_modifier: () => choice('_unaligned', '__unaligned'),

      ms_pointer_size_modifier: () => choice('__ptr32', '__ptr64'),

      ms_pointer_modifier: ($) =>
        choice(
          $.ms_unaligned_ptr_modifier,
          $.ms_restrict_modifier,
          $.ms_unsigned_ptr_modifier,
          $.ms_signed_ptr_modifier,
          $.ms_pointer_size_modifier
        ),

      declaration_list: ($) => seq('{', repeat($._top_level_item), '}'),

      _declarator: ($) => choice($.attributed_declarator, $._unattributed_declarator),

      _unattributed_declarator: ($) =>
        choice(
          $.pointer_declarator,
          $.function_declarator,
          $.array_declarator,
          $.parenthesized_declarator,
          $.identifier,
          alias(VA_ARG_KEYWORDS, $.identifier)
        ),

      _declaration_declarator: ($) =>
        declarationDeclaratorRule($, alias($._function_declaration_declarator, $.function_declarator)),

      _macro_declaration_declarator: ($) => declarationDeclaratorRule($, $.function_declarator),

      _field_declarator: ($) =>
        choice(alias($.attributed_field_declarator, $.attributed_declarator), $._unattributed_field_declarator),

      _unattributed_field_declarator: ($) =>
        choice(
          alias($.pointer_field_declarator, $.pointer_declarator),
          alias($.function_field_declarator, $.function_declarator),
          alias($.array_field_declarator, $.array_declarator),
          alias($.parenthesized_field_declarator, $.parenthesized_declarator),
          $._field_identifier
        ),

      _type_declarator: ($) =>
        choice(alias($.attributed_type_declarator, $.attributed_declarator), $._unattributed_type_declarator),

      _unattributed_type_declarator: ($) =>
        choice(
          alias($.pointer_type_declarator, $.pointer_declarator),
          alias($.function_type_declarator, $.function_declarator),
          alias($.array_type_declarator, $.array_declarator),
          alias($.parenthesized_type_declarator, $.parenthesized_declarator),
          $._type_identifier,
          alias(choice('signed', 'unsigned', 'long', 'short'), $.primitive_type),
          $.primitive_type
        ),

      _abstract_declarator: ($) =>
        choice(
          $.abstract_pointer_declarator,
          $.abstract_function_declarator,
          $.abstract_array_declarator,
          $.abstract_parenthesized_declarator
        ),

      parenthesized_declarator: ($) =>
        prec.dynamic(PREC.PAREN_DECLARATOR, parenthesizedDeclaratorRule($, $._declarator)),
      parenthesized_field_declarator: ($) =>
        prec.dynamic(PREC.PAREN_DECLARATOR, parenthesizedDeclaratorRule($, $._field_declarator)),
      parenthesized_type_declarator: ($) =>
        prec.dynamic(PREC.PAREN_DECLARATOR, parenthesizedDeclaratorRule($, $._type_declarator)),
      abstract_parenthesized_declarator: ($) => prec(1, parenthesizedDeclaratorRule($, $._abstract_declarator)),

      attributed_declarator: ($) => seq($._unattributed_declarator, repeat1($.attribute_declaration)),
      attributed_field_declarator: ($) => seq($._unattributed_field_declarator, repeat1($.attribute_declaration)),
      attributed_type_declarator: ($) => seq($._unattributed_type_declarator, repeat1($.attribute_declaration)),

      pointer_declarator: ($) => pointerDeclaratorRule($, $._declarator),
      pointer_field_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional($.ms_based_modifier),
              optional(prec.dynamic(2, $.ms_call_modifier)),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(
                choice(
                  $.type_qualifier,
                  $.attribute_specifier,
                  prec(-1, $.ms_call_modifier),
                  $.macro_specifier,
                  $._conditional_macro_specifier
                )
              ),
              field('declarator', $._field_declarator)
            )
          )
        ),
      pointer_type_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional($.ms_based_modifier),
              optional(prec.dynamic(2, $.ms_call_modifier)),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(
                choice(
                  $.type_qualifier,
                  $.attribute_specifier,
                  prec(-1, $.ms_call_modifier),
                  $.macro_specifier,
                  $._conditional_macro_specifier
                )
              ),
              field('declarator', $._type_declarator)
            )
          )
        ),
      abstract_pointer_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional(prec.dynamic(2, $.ms_call_modifier)),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(choice($.type_qualifier, $.attribute_specifier, prec(-1, $.ms_call_modifier))),
              field('declarator', optional($._abstract_declarator))
            )
          )
        ),

      function_declarator: ($) =>
        prec.right(
          1,
          seq(
            field('declarator', $._declarator),
            field('parameters', $.parameter_list),
            optional($.gnu_asm_expression),
            repeat(choice($.attribute_specifier, $.identifier, alias($.preproc_call_expression, $.call_expression)))
          )
        ),

      _function_declaration_declarator: ($) =>
        prec.right(
          1,
          seq(
            field('declarator', $._declarator),
            field('parameters', $.parameter_list),
            optional($.gnu_asm_expression),
            repeat($.attribute_specifier)
          )
        ),

      function_field_declarator: ($) =>
        prec(1, seq(field('declarator', $._field_declarator), field('parameters', $.parameter_list))),
      function_type_declarator: ($) =>
        prec(1, seq(field('declarator', $._type_declarator), field('parameters', $.parameter_list))),
      abstract_function_declarator: ($) =>
        prec(1, seq(field('declarator', optional($._abstract_declarator)), field('parameters', $.parameter_list))),

      _old_style_function_declarator: ($) =>
        seq(
          field('declarator', $._declarator),
          field('parameters', alias($._old_style_parameter_list, $.parameter_list))
        ),

      array_declarator: ($) =>
        prec(
          1,
          seq(
            field('declarator', $._declarator),
            '[',
            repeat(choice($.type_qualifier, 'static')),
            field('size', optional(choice($.expression, '*'))),
            ']'
          )
        ),
      array_field_declarator: ($) =>
        prec(
          1,
          seq(
            field('declarator', $._field_declarator),
            '[',
            repeat(choice($.type_qualifier, 'static')),
            field('size', optional(choice($.expression, '*'))),
            ']'
          )
        ),
      array_type_declarator: ($) =>
        prec(
          1,
          seq(
            field('declarator', $._type_declarator),
            '[',
            repeat(choice($.type_qualifier, 'static')),
            field('size', optional(choice($.expression, '*'))),
            ']'
          )
        ),
      abstract_array_declarator: ($) =>
        prec(
          1,
          seq(
            field('declarator', optional($._abstract_declarator)),
            '[',
            repeat(choice($.type_qualifier, 'static')),
            field('size', optional(choice($.expression, '*'))),
            ']'
          )
        ),

      init_declarator: ($) =>
        seq(field('declarator', $._declarator), '=', field('value', choice($.initializer_list, $.expression))),

      compound_statement: ($) => seq('{', repeat($._block_item), '}'),

      storage_class_specifier: () =>
        choice(
          'extern',
          'static',
          'auto',
          'register',
          'inline',
          '__inline',
          '__inline__',
          '__forceinline',
          'thread_local',
          '_Thread_local',
          '__thread'
        ),

      type_qualifier: ($) =>
        choice(
          'const',
          'constexpr',
          'volatile',
          'restrict',
          '__restrict__',
          '__extension__',
          '_Atomic',
          '_Noreturn',
          'noreturn',
          '_Nonnull',
          $.alignas_qualifier
        ),

      alignas_qualifier: ($) => seq(choice('alignas', '_Alignas'), '(', choice($.expression, $.type_descriptor), ')'),

      type_specifier: ($) =>
        choice(
          $._non_identifier_type_specifier,
          $.macro_type_specifier,
          $._type_identifier,
          prec.dynamic(-1, alias('thread_local', sym('type_identifier')))
        ),

      _non_identifier_type_specifier: ($) =>
        choice(
          $.struct_specifier,
          $.union_specifier,
          $.enum_specifier,
          $.typeof_specifier,
          $.bit_int_specifier,
          $.atomic_type_specifier,
          $.sized_type_specifier,
          alias($._sized_bit_int_specifier, $.sized_type_specifier),
          $.primitive_type
        ),

      typeof_specifier: ($) =>
        seq(
          choice('typeof', 'typeof_unqual', '__typeof__', '__typeof', '__typeof_unqual', '__typeof_unqual__'),
          '(',
          choice($.type_descriptor, $.expression, $.comma_expression),
          ')'
        ),
      atomic_type_specifier: ($) => seq('_Atomic', '(', field('type', $.type_descriptor), ')'),

      bit_int_specifier: ($) => seq('_BitInt', '(', $.expression, ')'),

      sized_type_specifier: ($) =>
        sizedTypeSpecifier(optional(choice(prec.dynamic(-3, $._type_identifier), $.primitive_type))),

      _sized_bit_int_specifier: ($) => sizedTypeSpecifier($.bit_int_specifier),

      primitive_type: () =>
        token(
          choice(
            ...primitiveTypeKeywords,
            'size_t',
            'ssize_t',
            'ptrdiff_t',
            'intptr_t',
            'uintptr_t',
            'charptr_t',
            'nullptr_t',
            'max_align_t',
            ...[8, 16, 32, 64].map((n) => `int${n}_t`),
            ...[8, 16, 32, 64].map((n) => `uint${n}_t`),
            ...[8, 16, 32, 64].map((n) => `char${n}_t`)
          )
        ),

      enum_specifier: ($) =>
        seq(
          'enum',
          repeat(choice($.attribute_specifier, $.attribute_declaration)),
          choice(
            seq(
              field('name', $._type_identifier),
              optional(
                seq(
                  ':',
                  field(
                    'underlying_type',
                    choice($.primitive_type, $.sized_type_specifier, $.typeof_specifier, $._type_identifier)
                  )
                )
              ),
              field('body', optional($.enumerator_list))
            ),
            seq(
              optional(
                seq(
                  ':',
                  field(
                    'underlying_type',
                    choice($.primitive_type, $.sized_type_specifier, $.typeof_specifier, $._type_identifier)
                  )
                )
              ),
              field('body', $.enumerator_list)
            )
          ),
          optional($.attribute_specifier)
        ),

      enumerator_list: ($) =>
        seq(
          '{',
          repeat(
            choice(
              seq($.enumerator, ','),
              alias(sym('preproc_if_in_enumerator_list'), sym('preproc_if')),
              alias(sym('preproc_ifdef_in_enumerator_list'), sym('preproc_ifdef')),
              seq($.preproc_call, ','),
              prec(1, $.preproc_call)
            )
          ),
          optional(
            seq(
              choice(
                $.enumerator,
                alias(sym('preproc_if_in_enumerator_list_no_comma'), sym('preproc_if')),
                alias(sym('preproc_ifdef_in_enumerator_list_no_comma'), sym('preproc_ifdef'))
              )
            )
          ),
          repeat($.preproc_call),
          '}'
        ),

      struct_specifier: ($) =>
        prec.right(
          seq(
            'struct',
            repeat(choice($.attribute_specifier, $.attribute_declaration, $.ms_declspec_modifier)),
            choice(
              seq(field('name', $._type_identifier), field('body', optional($.field_declaration_list))),
              field('body', $.field_declaration_list)
            ),
            optional($.attribute_specifier)
          )
        ),

      union_specifier: ($) =>
        prec.right(
          seq(
            'union',
            repeat(choice($.attribute_specifier, $.attribute_declaration, $.ms_declspec_modifier)),
            choice(
              seq(field('name', $._type_identifier), field('body', optional($.field_declaration_list))),
              field('body', $.field_declaration_list)
            ),
            optional($.attribute_specifier)
          )
        ),

      field_declaration_list: ($) => seq('{', repeat($._field_declaration_list_item), '}'),

      _field_declaration_list_item: ($) =>
        choice(
          $.field_declaration,
          prec.dynamic(-1, $.macro_specifier),
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_call,
          alias(sym('preproc_if_in_field_declaration_list'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_field_declaration_list'), sym('preproc_ifdef'))
        ),

      field_declaration: ($) =>
        seq($._declaration_specifiers, optional($._field_declaration_declarator), optional($.attribute_specifier), ';'),
      _field_declaration_declarator: ($) =>
        commaSep1(seq(field('declarator', $._field_declarator), optional($.bitfield_clause))),

      bitfield_clause: ($) => seq(':', $.expression),

      enumerator: ($) => seq(field('name', $.identifier), optional(seq('=', field('value', $.expression)))),

      variadic_parameter: () => '...',

      parameter_list: ($) =>
        seq('(', choice(commaSep(choice($.parameter_declaration, $.variadic_parameter)), $.compound_statement), ')'),
      _old_style_parameter_list: ($) =>
        seq('(', commaSep1(choice($.identifier, alias(VA_ARG_KEYWORDS, $.identifier), $.variadic_parameter)), ')'),

      parameter_declaration: ($) =>
        seq(
          $._declaration_specifiers,
          optional(field('declarator', choice($._declarator, $._abstract_declarator))),
          repeat($.attribute_specifier)
        ),

      attributed_statement: ($) =>
        seq(repeat1($.attribute_declaration), alias($._unattributed_non_case_statement, $.statement)),

      statement: ($) => choice($.case_statement, alias($._non_case_statement, $.statement)),

      _non_case_statement: ($) =>
        choice($.attributed_statement, alias($._unattributed_non_case_statement, $.statement)),

      _unattributed_non_case_statement: ($) => choice($.labeled_statement, $._unlabeled_non_case_statement),

      _unlabeled_non_case_statement: ($) =>
        choice(
          $.compound_statement,
          $.expression_statement,
          $.if_statement,
          $.switch_statement,
          $.do_statement,
          $.while_statement,
          $.for_statement,
          $.return_statement,
          $.break_statement,
          $.continue_statement,
          $.goto_statement,
          $.seh_try_statement,
          $.seh_leave_statement
        ),

      _top_level_statement: ($) =>
        choice(
          $.case_statement,
          $.attributed_statement,
          $.labeled_statement,
          $.compound_statement,
          alias($._top_level_expression_statement, $.expression_statement),
          $.if_statement,
          $.switch_statement,
          $.do_statement,
          $.while_statement,
          $.for_statement,
          $.return_statement,
          $.break_statement,
          $.continue_statement,
          $.goto_statement
        ),

      labeled_statement: ($) =>
        seq(
          field('label', $._statement_identifier),
          ':',
          choice(alias($._statement_declaration, $.declaration), $.statement)
        ),

      // This is missing binary expressions, others were kept so that macro code can be parsed better and code examples
      _top_level_expression_statement: ($) => seq(optional($._expression_not_binary), ';'),

      expression_statement: ($) => seq(optional(choice($.expression, $.comma_expression)), ';'),

      if_statement: ($) =>
        prec.right(
          seq(
            'if',
            field('condition', $.parenthesized_expression),
            field('consequence', $._single_statement),
            optional(field('alternative', $.else_clause))
          )
        ),

      else_clause: ($) => seq('else', $._single_statement),

      switch_statement: ($) =>
        seq('switch', field('condition', $.parenthesized_expression), field('body', $._single_statement)),

      _single_statement: ($) => choice($.compound_statement, alias($._single_noncompound_statement, $.statement)),

      _single_noncompound_statement: ($) =>
        choice(alias($._single_case_statement, $.case_statement), alias($._single_non_case_statement, $.statement)),

      _single_non_case_statement: ($) =>
        choice(
          alias($._single_unattributed_non_case_statement, $.statement),
          alias($._single_attributed_statement, $.attributed_statement)
        ),

      _single_unattributed_non_case_statement: ($) =>
        choice(
          $.expression_statement,
          $.switch_statement,
          $.return_statement,
          $.break_statement,
          $.continue_statement,
          $.goto_statement,
          $.seh_try_statement,
          $.seh_leave_statement,
          alias($._single_labeled_statement, $.labeled_statement),
          $.if_statement,
          $.while_statement,
          $.do_statement,
          $.for_statement
        ),

      _single_case_statement: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              repeat($.attribute_declaration),
              choice(
                seq('case', field('value', $.expression), optional(seq('...', field('end_value', $.expression)))),
                'default'
              ),
              ':',
              optional($._single_case_body)
            )
          )
        ),
      _single_case_body: ($) =>
        prec.dynamic(
          1,
          choice(
            $._single_statement,
            alias($._statement_declaration, $.declaration),
            alias($._statement_type_definition, $.type_definition),
            alias(sym('preproc_if_in_single_case'), sym('preproc_if')),
            alias(sym('preproc_ifdef_in_single_case'), sym('preproc_ifdef'))
          )
        ),
      _single_labeled_statement: ($) =>
        seq(
          field('label', $._statement_identifier),
          ':',
          choice($._single_statement, alias($._statement_declaration, $.declaration))
        ),
      _single_attributed_statement: ($) =>
        seq(
          repeat1($.attribute_declaration),
          choice($.compound_statement, alias($._single_unattributed_non_case_statement, $.statement))
        ),

      case_statement: ($) =>
        prec.dynamic(
          1,
          seq(
            repeat($.attribute_declaration),
            choice(
              seq('case', field('value', $.expression), optional(seq('...', field('end_value', $.expression)))),
              'default'
            ),
            ':',
            repeat($._case_statement_item),
            optional(alias($._case_label_tail, $.statement))
          )
        ),

      _case_statement_item: ($) =>
        prec.dynamic(
          1,
          choice(
            alias($._case_body_statement, $.statement),
            alias($._statement_declaration, $.declaration),
            alias($._statement_type_definition, $.type_definition)
          )
        ),

      _case_body_statement: ($) =>
        choice(
          alias($._case_body_unattributed_statement, $.statement),
          alias($._case_body_attributed_statement, $.attributed_statement)
        ),
      _case_body_unattributed_statement: ($) =>
        choice($._unlabeled_non_case_statement, alias($._case_body_labeled_statement, $.labeled_statement)),
      _case_body_labeled_statement: ($) =>
        seq(
          field('label', $._statement_identifier),
          ':',
          choice(alias($._statement_declaration, $.declaration), alias($._case_body_statement, $.statement))
        ),
      _case_body_attributed_statement: ($) =>
        prec(1, seq(repeat1($.attribute_declaration), alias($._case_body_unattributed_statement, $.statement))),
      _case_label_tail: ($) =>
        prec.dynamic(
          1,
          choice(
            alias($._case_label_chain, $.labeled_statement),
            alias($._case_label_attributes, $.attributed_statement)
          )
        ),
      _case_label_attributes: ($) =>
        seq(repeat1($.attribute_declaration), alias($._case_label_chain_statement, $.statement)),
      _case_label_chain_statement: ($) => alias($._case_label_chain, $.labeled_statement),
      _case_label_chain: ($) =>
        seq(field('label', $._statement_identifier), ':', alias($._case_label_statement, $.statement)),
      _case_label_statement: ($) => choice($.case_statement, alias($._case_label_tail, $.statement)),

      while_statement: ($) =>
        seq('while', field('condition', $.parenthesized_expression), field('body', $._single_statement)),

      do_statement: ($) =>
        seq('do', field('body', $._single_statement), 'while', field('condition', $.parenthesized_expression), ';'),

      for_statement: ($) => seq('for', '(', $._for_statement_body, ')', field('body', $._single_statement)),
      _for_statement_body: ($) =>
        seq(
          choice(
            field('initializer', alias($._statement_declaration, $.declaration)),
            seq(field('initializer', optional(choice($.expression, $.comma_expression))), ';')
          ),
          field('condition', optional(choice($.expression, $.comma_expression))),
          ';',
          field('update', optional(choice($.expression, $.comma_expression)))
        ),

      return_statement: ($) => seq('return', optional(choice($.expression, $.comma_expression)), ';'),

      break_statement: () => seq('break', ';'),

      continue_statement: () => seq('continue', ';'),

      goto_statement: ($) =>
        seq(
          'goto',
          choice(
            field('label', $._statement_identifier),
            seq('*', field('label', choice($.expression, $.comma_expression)))
          ),
          ';'
        ),

      seh_try_statement: ($) =>
        seq('__try', field('body', $.compound_statement), choice($.seh_except_clause, $.seh_finally_clause)),

      seh_except_clause: ($) =>
        seq('__except', field('filter', $.parenthesized_expression), field('body', $.compound_statement)),

      seh_finally_clause: ($) => seq('__finally', field('body', $.compound_statement)),

      seh_leave_statement: () => seq('__leave', ';'),

      expression: ($) => choice($._expression_not_binary, $.binary_expression),

      _expression_not_binary: ($) =>
        choice(
          $.conditional_expression,
          $.assignment_expression,
          $.unary_expression,
          $.update_expression,
          $.cast_expression,
          $.pointer_expression,
          $.sizeof_expression,
          $.countof_expression,
          $.alignof_expression,
          $.offsetof_expression,
          $.va_arg_expression,
          $.generic_expression,
          $.subscript_expression,
          $.call_expression,
          $.field_expression,
          $.compound_literal_expression,
          $.identifier,
          alias('thread_local', $.identifier),
          alias(VA_ARG_KEYWORDS, $.identifier),
          $.number_literal,
          $._string,
          $.true,
          $.false,
          $.null,
          $.char_literal,
          $.parenthesized_expression,
          $.gnu_asm_expression,
          $.extension_expression,
          $.builtin_available_expression
        ),

      _string: ($) => prec.left(choice($.string_literal, $.concatenated_string)),

      comma_expression: ($) =>
        seq(field('left', $.expression), ',', field('right', choice($.expression, $.comma_expression))),

      conditional_expression: ($) =>
        prec.right(
          PREC.CONDITIONAL,
          seq(
            field('condition', $.expression),
            '?',
            optional(field('consequence', choice($.expression, $.comma_expression))),
            ':',
            field('alternative', $.expression)
          )
        ),

      _assignment_left_expression: ($) =>
        choice(
          alias(VA_ARG_KEYWORDS, $.identifier),
          $.identifier,
          $.call_expression,
          $.field_expression,
          $.pointer_expression,
          $.subscript_expression,
          $.parenthesized_expression
        ),

      assignment_expression: ($) =>
        prec.right(
          PREC.ASSIGNMENT,
          seq(
            field('left', $._assignment_left_expression),
            field('operator', choice('=', '*=', '/=', '%=', '+=', '-=', '<<=', '>>=', '&=', '^=', '|=')),
            field('right', $.expression)
          )
        ),

      pointer_expression: ($) =>
        prec.left(PREC.CAST, seq(field('operator', choice('*', '&')), field('argument', $.expression))),

      unary_expression: ($) =>
        prec.left(PREC.UNARY, seq(field('operator', choice('!', '~', '-', '+')), field('argument', $.expression))),

      binary_expression: ($) => {
        return choice(
          ...BINARY_OPERATORS.map(([operator, precedence]) => {
            const body = seq(field('left', $.expression), field('operator', operator), field('right', $.expression));
            return prec.left(precedence, operator === '&&' ? prec.dynamic(1, body) : body);
          })
        );
      },

      update_expression: ($) => {
        const argument = field('argument', $.expression);
        const operator = field('operator', choice('--', '++'));
        return prec.right(PREC.UNARY, choice(seq(operator, argument), seq(argument, operator)));
      },

      cast_expression: ($) =>
        prec(PREC.CAST, seq('(', field('type', $.type_descriptor), ')', field('value', $.expression))),

      type_descriptor: ($) =>
        seq(
          repeat($.type_qualifier),
          field('type', $.type_specifier),
          repeat($.type_qualifier),
          field('declarator', optional($._abstract_declarator))
        ),

      sizeof_expression: ($) =>
        prec.dynamic(
          2,
          prec(
            PREC.SIZEOF,
            seq(
              'sizeof',
              choice(field('value', prec.dynamic(3, $.expression)), seq('(', field('type', $.type_descriptor), ')'))
            )
          )
        ),

      countof_expression: ($) =>
        prec(
          PREC.SIZEOF,
          seq(
            '_Countof',
            choice(
              field('value', prec.dynamic(3, $.expression)),
              prec.dynamic(2, seq('(', field('type', $.type_descriptor), ')'))
            )
          )
        ),

      alignof_expression: ($) =>
        prec.dynamic(
          2,
          prec(
            PREC.SIZEOF,
            seq(
              choice('__alignof__', '__alignof', '_alignof', 'alignof', '_Alignof'),
              seq('(', field('type', $.type_descriptor), ')')
            )
          )
        ),

      offsetof_expression: ($) =>
        prec(
          PREC.OFFSETOF,
          seq('offsetof', seq('(', field('type', $.type_descriptor), ',', field('member', $._field_identifier), ')'))
        ),

      va_arg_expression: ($) =>
        prec.dynamic(
          1,
          seq(VA_ARG_KEYWORDS, '(', field('value', $.expression), ',', field('type', $.type_descriptor), ')')
        ),

      generic_expression: ($) =>
        prec(
          PREC.CALL,
          seq('_Generic', '(', $.expression, ',', commaSep1(seq($.type_descriptor, ':', $.expression)), ')')
        ),

      subscript_expression: ($) =>
        prec(PREC.SUBSCRIPT, seq(field('argument', $.expression), '[', field('index', $.expression), ']')),

      call_expression: ($) =>
        prec(PREC.CALL, seq(field('function', $.expression), field('arguments', $.argument_list))),

      builtin_available_expression: ($) =>
        seq('__builtin_available', '(', commaSep1(choice($.platform_version, '*')), ')'),

      platform_version: ($) => seq(field('platform', $.identifier), field('version', $.version_number)),

      version_number: () => /\d+(\.\d+){0,2}/,

      gnu_asm_expression: ($) =>
        prec(
          PREC.CALL,
          seq(
            choice('asm', '__asm__', '__asm'),
            repeat($.gnu_asm_qualifier),
            '(',
            field('assembly_code', $._string),
            optional(
              seq(
                field('output_operands', $.gnu_asm_output_operand_list),
                optional(
                  seq(
                    field('input_operands', $.gnu_asm_input_operand_list),
                    optional(
                      seq(
                        field('clobbers', $.gnu_asm_clobber_list),
                        optional(field('goto_labels', $.gnu_asm_goto_list))
                      )
                    )
                  )
                )
              )
            ),
            ')'
          )
        ),

      gnu_asm_qualifier: () => choice('volatile', '__volatile__', 'inline', 'goto'),

      gnu_asm_output_operand_list: ($) => seq(':', commaSep(field('operand', $.gnu_asm_output_operand))),

      gnu_asm_output_operand: ($) =>
        seq(
          optional(seq('[', field('symbol', $.identifier), ']')),
          field('constraint', $.string_literal),
          '(',
          field('value', $.expression),
          ')'
        ),

      gnu_asm_input_operand_list: ($) => seq(':', commaSep(field('operand', $.gnu_asm_input_operand))),

      gnu_asm_input_operand: ($) =>
        seq(
          optional(seq('[', field('symbol', $.identifier), ']')),
          field('constraint', $.string_literal),
          '(',
          field('value', $.expression),
          ')'
        ),

      gnu_asm_clobber_list: ($) => seq(':', commaSep(field('register', $._string))),

      gnu_asm_goto_list: ($) => seq(':', commaSep(field('label', $.identifier))),

      extension_expression: ($) => seq('__extension__', $.expression),

      argument_list: ($) =>
        seq(
          '(',
          optional(
            seq(
              commaSep1(
                choice($.expression, $.compound_statement, $.initializer_pair, prec.dynamic(-1, $.initializer_list))
              ),
              optional(',')
            )
          ),
          ')'
        ),

      field_expression: ($) =>
        seq(
          prec(PREC.FIELD, seq(field('argument', $.expression), field('operator', choice('.', '->')))),
          field('field', $._field_identifier)
        ),

      compound_literal_expression: ($) =>
        seq(
          '(',
          repeat(
            seq(
              optional(
                field('storage_class', alias($._compound_literal_constexpr_specifier, $.storage_class_specifier))
              ),
              field('storage_class', alias($._compound_literal_storage_class_specifier, $.storage_class_specifier))
            )
          ),
          field('type', $.type_descriptor),
          ')',
          field('value', $.initializer_list)
        ),

      _compound_literal_constexpr_specifier: () => 'constexpr',

      _compound_literal_storage_class_specifier: () =>
        choice('static', 'register', 'thread_local', '_Thread_local', '__thread'),

      parenthesized_expression: ($) => seq('(', choice($.expression, $.comma_expression, $.compound_statement), ')'),

      initializer_list: ($) => seq('{', optional($._initializer_sequence), '}'),

      _initializer_sequence: ($) =>
        choice(
          seq(
            $._initializer_element,
            optional(choice(seq(',', optional($._initializer_sequence)), $._initializer_directives))
          ),
          $._initializer_directives
        ),

      _initializer_directives: ($) =>
        seq(
          $._initializer_directive,
          optional(choice($._initializer_sequence, seq(',', optional($._initializer_sequence))))
        ),

      _initializer_directive: ($) =>
        choice(
          alias(sym('preproc_if_in_initializer_list'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_initializer_list'), sym('preproc_ifdef')),
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_include,
          $.preproc_call
        ),

      _initializer_element: ($) => choice($.initializer_pair, $.expression, $.initializer_list),

      _initializer_branch: ($) => choice(seq(',', optional($._initializer_sequence)), $._initializer_sequence),

      ...preprocIf('_in_initializer_list', () => sym('_initializer_branch'), 0, false),

      initializer_pair: ($) =>
        choice(
          seq(
            field(
              'designator',
              repeat1(choice($.subscript_designator, $.field_designator, $.subscript_range_designator))
            ),
            '=',
            field('value', choice($.expression, $.initializer_list))
          ),
          seq(field('designator', $._field_identifier), ':', field('value', choice($.expression, $.initializer_list)))
        ),

      subscript_designator: ($) => seq('[', $.expression, ']'),

      subscript_range_designator: ($) => seq('[', field('start', $.expression), '...', field('end', $.expression), ']'),

      field_designator: ($) => seq('.', $._field_identifier),

      number_literal: () => {
        const separator = "'";
        const hex = /[0-9a-fA-F]/;
        const decimal = /[0-9]/;
        const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
        const decimalDigits = seq(repeat1(decimal), repeat(seq(separator, repeat1(decimal))));
        return token(
          seq(
            optional(/[-+]/),
            choice(
              seq(
                choice(decimalDigits, seq(/0[bB]/, decimalDigits), seq(/0[xX]/, hexDigits)),
                optional(seq('.', optional(hexDigits)))
              ),
              seq('.', decimalDigits),
              seq(/0[xX]/, '.', hexDigits)
            ),
            optional(seq(/[eEpP]/, optional(seq(optional(/[-+]/), hexDigits)))),
            /[uUlLwWfFbBdD]*/
          )
        );
      },

      char_literal: ($) =>
        seq(
          choice("L'", "u'", "U'", "u8'", "'"),
          repeat1(
            choice($.escape_sequence, $.invalid_escape_sequence, alias(token.immediate(/[^\\\n']/), sym('character')))
          ),
          "'"
        ),

      // Identifier is added to parse macros that are strings, like PRIu64.
      concatenated_string: ($) =>
        prec.right(
          seq(
            choice(
              seq($.identifier, $.string_literal),
              seq($.string_literal, $.string_literal),
              seq($.string_literal, $.identifier)
            ),
            repeat(choice($.string_literal, $.identifier))
          )
        ),

      string_literal: ($) =>
        seq(
          choice('L"', 'u"', 'U"', 'u8"', '"'),
          repeat(
            choice(
              alias(token.immediate(prec(1, /[^\\"\n]+/)), sym('string_content')),
              $.escape_sequence,
              $.invalid_escape_sequence
            )
          ),
          '"'
        ),

      escape_sequence: () =>
        token(
          prec(
            1,
            seq(
              '\\',
              choice(
                /['"?\\abefnrtvE]/,
                '(',
                '[',
                '{',
                '%',
                /\r\n?|\n\r?/,
                /[xu]\{[0-9a-fA-F]+\}/,
                /o\{[0-7]+\}/,
                /N\{[^}\n]+\}/,
                /[0-7]{1,3}/,
                /x[0-9a-fA-F]+/,
                /u[0-9a-fA-F]{4}/,
                /U[0-9a-fA-F]{8}/
              )
            )
          )
        ),

      invalid_escape_sequence: () => token(seq('\\', choice(/[^\r\n]/, /u[0-9a-fA-F]{1,3}/, /U[0-9a-fA-F]{1,7}/))),

      system_lib_string: () => token(seq('<', repeat(choice(/[^>\n]/, String.raw`\>`)), '>')),

      true: () => 'true',
      false: () => 'false',
      null: () => choice('NULL', 'nullptr'),

      identifier: () =>
        /(\p{XID_Start}|\$|_|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})(\p{XID_Continue}|\$|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})*/u,
      _type_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('type_identifier')),
      _field_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('field_identifier')),
      _statement_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('statement_identifier')),

      _empty_declaration: ($) =>
        seq(
          repeat(choice($.ms_declspec_modifier, $.macro_specifier, $._leading_conditional_macro_specifier)),
          $.type_specifier,
          ';'
        ),
      _statement_empty_declaration: ($) => seq(repeat($.ms_declspec_modifier), $.type_specifier, ';'),

      macro_specifier: ($) => prec.dynamic(-2, field('name', $.identifier)),

      _conditional_macro_specifier: () => alias(sym('_marker_preproc_ifdef'), sym('preproc_ifdef')),
      _leading_conditional_macro_specifier: () => alias(sym('_leading_marker_preproc_ifdef'), sym('preproc_ifdef')),

      _marker_preproc_ifdef: ($) =>
        conditionalMacroRule($, sym('_conditional_marker_ifdef'), sym('_conditional_marker_ifndef')),
      _leading_marker_preproc_ifdef: ($) =>
        conditionalMacroRule($, sym('_leading_conditional_marker_ifdef'), sym('_leading_conditional_marker_ifndef')),

      macro_type_specifier: ($) =>
        prec.dynamic(
          -1,
          seq(
            field('name', choice($.identifier, alias(VA_ARG_KEYWORDS, $.identifier))),
            '(',
            field('type', $.type_descriptor),
            ')'
          )
        ),

      _preproc_number: () =>
        /(\d|\.\d)([\p{XID_Continue}.]|[eEpP][+-]|'[_a-zA-Z0-9]|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8})*/u,

      comment: () => token(choice(LINE_COMMENT, seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
    },
  }),
  { PREC, preprocIf, preprocessor, commaSep, commaSep1 }
);

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'identifier' | 'macro_specifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} ifdef
 * @param {import('./types/treeSitterDsl').Rule} ifndef
 */
function conditionalMacroRule($, ifdef, ifndef) {
  return seq(
    choice(alias(ifdef, '#ifdef'), alias(ifndef, '#ifndef')),
    field('name', $.identifier),
    $.macro_specifier,
    preprocessor('endif')
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'ms_call_modifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} declarator
 */
function parenthesizedDeclaratorRule($, declarator) {
  const parenthesized = seq('(', optional($.ms_call_modifier), declarator, ')');
  return choice(parenthesized, prec(2, seq($.ms_call_modifier, parenthesized)));
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'ms_based_modifier' | 'ms_call_modifier' | 'attribute_declaration' | 'ms_pointer_modifier' | 'type_qualifier' | 'attribute_specifier' | 'macro_specifier' | '_conditional_macro_specifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} declarator
 */
function pointerDeclaratorRule($, declarator) {
  return prec.right(
    seq(
      optional($.ms_based_modifier),
      optional(prec.dynamic(2, $.ms_call_modifier)),
      '*',
      repeat($.attribute_declaration),
      repeat($.ms_pointer_modifier),
      repeat(
        choice(
          $.type_qualifier,
          $.attribute_specifier,
          prec(-1, $.ms_call_modifier),
          $.macro_specifier,
          $._conditional_macro_specifier
        )
      ),
      field('declarator', declarator)
    )
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'ms_call_modifier' | '_old_style_declarator' | '_declarator' | 'declaration' | 'compound_statement'>} $
 * @param {import('./types/treeSitterDsl').Rule} specifiers
 * @param {boolean} oldStyle
 */
function functionDefinitionRule($, specifiers, oldStyle) {
  return seq(
    optional($.ms_call_modifier),
    specifiers,
    ...(oldStyle ? [] : [optional($.ms_call_modifier)]),
    field('declarator', oldStyle ? alias($._old_style_declarator, $._declarator) : $._declarator),
    ...(oldStyle ? [repeat1($.declaration)] : []),
    field('body', $.compound_statement)
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'storage_class_specifier' | 'ms_call_modifier' | '_declaration_declarator' | 'gnu_asm_expression' | 'init_declarator' | 'type_qualifier' | 'identifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} specifiers
 * @param {import('./types/treeSitterDsl').Rule} modifiers
 * @param {boolean} allowInferredType
 * @param {import('./types/treeSitterDsl').Rule} declarator
 */
function declarationRule($, specifiers, modifiers, allowInferredType = true, declarator = $._declaration_declarator) {
  return choice(
    seq(
      prec.dynamic(
        1,
        allowInferredType
          ? choice(
              specifiers,
              prec.dynamic(
                PREC.PAREN_DECLARATOR - 1,
                seq(repeat(modifiers), alias('auto', $.storage_class_specifier), repeat(modifiers))
              )
            )
          : specifiers
      ),
      commaSep1(
        field(
          'declarator',
          choice(seq(optional($.ms_call_modifier), declarator, optional($.gnu_asm_expression)), $.init_declarator)
        )
      ),
      ';'
    ),
    ...(allowInferredType
      ? [seq(repeat1($.type_qualifier), commaSep1(field('declarator', choice($.identifier, $.init_declarator))), ';')]
      : [])
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'macro_specifier' | '_leading_conditional_macro_specifier' | 'type_qualifier' | '_type_definition_type' | '_non_identifier_type_specifier' | '_type_definition_declarators' | 'attribute_specifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} modifiers
 * @param {boolean} allowPrefixMarkers
 */
function typeDefinitionRule($, modifiers, allowPrefixMarkers) {
  return seq(
    optional(prec.dynamic(1, '__extension__')),
    ...(allowPrefixMarkers ? [repeat(choice($.macro_specifier, $._leading_conditional_macro_specifier))] : []),
    choice(
      seq(repeat($.type_qualifier), 'typedef', $._type_definition_type),
      seq(
        repeat(modifiers),
        field('type', $._non_identifier_type_specifier),
        repeat($.type_qualifier),
        'typedef',
        repeat(choice($.type_qualifier, $._non_identifier_type_specifier))
      )
    ),
    $._type_definition_declarators,
    repeat($.attribute_specifier),
    ';'
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'attributed_declarator' | 'pointer_declarator' | 'array_declarator' | 'parenthesized_declarator' | 'identifier'>} $
 * @param {import('./types/treeSitterDsl').Rule} functionDeclarator
 */
function declarationDeclaratorRule($, functionDeclarator) {
  return choice(
    $.attributed_declarator,
    $.pointer_declarator,
    functionDeclarator,
    $.array_declarator,
    $.parenthesized_declarator,
    $.identifier,
    alias(VA_ARG_KEYWORDS, $.identifier)
  );
}

/**
 * @param {import('./types/treeSitterDsl').GrammarSymbols<'identifier' | 'argument_list' | '_macro_attribute_argument_list'>} $
 * @param {'leading' | 'post-type' | 'continuation' | 'post-type-continuation' | 'trailing'} context
 */
function macroAttributeRule($, context) {
  const guard =
    context === 'continuation' || context === 'trailing'
      ? []
      : [
          sym(
            context === 'leading'
              ? '_function_attribute_start'
              : context === 'post-type'
                ? '_post_type_function_attribute_start'
                : '_post_type_function_attribute_suffix'
          ),
        ];
  return prec.dynamic(
    -2,
    seq(
      ...guard,
      field('name', context === 'trailing' ? alias(sym('_trailing_macro_attribute_name'), $.identifier) : $.identifier),
      field('arguments', alias($._macro_attribute_argument_list, $.argument_list))
    )
  );
}

/** @param {import('./types/treeSitterDsl').GrammarSymbols<'expression' | 'type_descriptor' | '_preproc_number' | 'number_literal'>} $ */
function macroAttributeArgument($) {
  return choice($.expression, prec.dynamic(-1, $.type_descriptor), alias($._preproc_number, $.number_literal));
}

/**
 * @param {import('./types/treeSitterDsl').RuleOrLiteral} type
 */
function sizedTypeSpecifier(type) {
  const modifier = choice('signed', 'unsigned', 'long', 'short', '_Complex', '_Imaginary', '__complex__');
  return choice(
    seq(repeat(modifier), field('type', type), repeat1(modifier)),
    seq(repeat1(modifier), repeat(sym('type_qualifier')), field('type', type), repeat(modifier))
  );
}

/**
 *
 * @param {string} suffix
 *
 * @param {import('./types/treeSitterDsl').RuleBuilder<string>} content
 *
 * @param {number} precedence
 * @param {boolean} repeatContent
 *
 * @returns {import('./types/treeSitterDsl').RuleBuilders<string, string>}
 */
function preprocIf(suffix, content, precedence = 0, repeatContent = true) {
  function alternativeBlock() {
    return choice(
      ...['preproc_else', 'preproc_elif', 'preproc_elifdef'].map((name) =>
        suffix ? alias(sym(name + suffix), sym(name)) : sym(name)
      )
    );
  }

  return {
    ['preproc_if' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          preprocessor('if'),
          field('condition', sym('_preproc_expression')),
          alias(token(/\r\n?|\n\r?/), '\n'),
          repeatContent ? repeat(content($)) : optional(content($)),
          field('alternative', optional(alternativeBlock())),
          preprocessor('endif')
        )
      ),

    ['preproc_ifdef' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          choice(preprocessor('ifdef'), preprocessor('ifndef')),
          field('name', sym('identifier')),
          repeatContent ? repeat(content($)) : optional(content($)),
          field('alternative', optional(alternativeBlock())),
          preprocessor('endif')
        )
      ),

    ['preproc_else' + suffix]: ($) =>
      prec(precedence, seq(preprocessor('else'), repeatContent ? repeat(content($)) : optional(content($)))),

    ['preproc_elif' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          preprocessor('elif'),
          field('condition', sym('_preproc_expression')),
          alias(token(/\r\n?|\n\r?/), '\n'),
          repeatContent ? repeat(content($)) : optional(content($)),
          field('alternative', optional(alternativeBlock()))
        )
      ),

    ['preproc_elifdef' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          choice(preprocessor('elifdef'), preprocessor('elifndef')),
          field('name', sym('identifier')),
          repeatContent ? repeat(content($)) : optional(content($)),
          field('alternative', optional(alternativeBlock()))
        )
      ),
  };
}

/**
 * Creates a preprocessor regex rule
 *
 * @param {string} command
 *
 * @returns {import('./types/treeSitterDsl').AliasRule}
 */
function preprocessor(command) {
  return alias(new RegExp('#[ \t]*' + command), '#' + command);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {import('./types/treeSitterDsl').Rule} rule
 *
 * @returns {import('./types/treeSitterDsl').ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {import('./types/treeSitterDsl').Rule} rule
 *
 * @returns {import('./types/treeSitterDsl').SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
