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

const LINE_COMMENT = seq('//', /(\\+(.|\r?\n)|[^\\\n])*/);
const PRAGMA_SPACING = repeat(choice(/\s/, /\\(?:\r\n?|\n\r?)/));
const PREPROC_ARGUMENT = /\S([^/\n]|\/[^*]|\\\r?\n)*/;
const VA_ARG_KEYWORDS = choice('va_arg', '__builtin_va_arg');

// oxlint-disable-next-line unicorn/prefer-module -- This package is CommonJS, so tree-sitter loads grammar.js as CommonJS.
module.exports = Object.assign(
  grammar({
    name: 'c',

    conflicts: ($) => [
      [$.type_specifier, $.expression, $.va_arg_expression, $.macro_type_specifier],
      [$.va_arg_expression, $.expression],
      [$.type_definition, $._declaration_modifiers],
      [$.type_definition, $.type_specifier],
      [$.type_definition, $.type_qualifier, $.extension_expression],
      [$.type_definition, $.type_qualifier],
      [$._declaration_modifiers, $._empty_declaration],
      [$.declaration, $.storage_class_specifier],
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
      [$.attributed_statement],
      [$._single_attributed_statement],
      [$._declaration_modifiers, $.attributed_statement],
      [$.enum_specifier],
      [$.type_specifier, $._old_style_parameter_list],
      [$.parameter_list, $._old_style_parameter_list],
      [$.function_declarator, $._function_declaration_declarator],
      [$._block_item, $.statement],
      [$._top_level_item, $._top_level_statement],
      [$.type_specifier, $._top_level_expression_statement],
      [$.type_qualifier, $.extension_expression],
      [$.storage_class_specifier, $.type_specifier],
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
    ],

    extras: ($) => [$.pragma_operator, /\s|\\(?:\r\n?|\n\r?)/, $.comment],

    inline: ($) => [
      $._non_identifier_type_specifier,
      $._type_identifier,
      $._field_identifier,
      $._statement_identifier,
      $._non_case_statement,
      $._assignment_left_expression,
      $._expression_not_binary,
    ],

    supertypes: ($) => [
      $.expression,
      $.statement,
      $._single_noncompound_statement,
      $.type_specifier,
      $._declarator,
      $._field_declarator,
      $._type_declarator,
      $._abstract_declarator,
    ],

    word: ($) => $.identifier,

    rules: {
      translation_unit: ($) => repeat($._top_level_item),

      // Top level items are block items with the exception of the expression statement
      _top_level_item: ($) =>
        choice(
          $.function_definition,
          alias($._old_style_function_definition, $.function_definition),
          $.linkage_specification,
          $.declaration,
          $._top_level_statement,
          $.attributed_statement,
          $.type_definition,
          $._empty_declaration,
          sym('preproc_if'),
          sym('preproc_ifdef'),
          $.preproc_include,
          $.preproc_def,
          $.preproc_function_def,
          $.preproc_call
        ),

      _block_item: ($) =>
        choice(
          $.function_definition,
          alias($._old_style_function_definition, $.function_definition),
          $.linkage_specification,
          $.declaration,
          $.statement,
          $.attributed_statement,
          $.type_definition,
          $._empty_declaration,
          sym('preproc_if'),
          sym('preproc_ifdef'),
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
      // Preprocesser

      preproc_include: ($) =>
        seq(
          preprocessor('include'),
          field(
            'path',
            choice(
              $.string_literal,
              $.system_lib_string,
              $.identifier,
              alias($.preproc_call_expression, $.call_expression)
            )
          ),
          sym('_preproc_newline')
        ),

      preproc_def: ($) =>
        seq(
          preprocessor('define'),
          field('name', $.identifier),
          field('value', optional($.preproc_arg)),
          sym('_preproc_newline')
        ),

      preproc_function_def: ($) =>
        seq(
          preprocessor('define'),
          field('name', alias(sym('_preproc_function_name'), $.identifier)),
          field('parameters', $.preproc_params),
          field('value', optional($.preproc_arg)),
          sym('_preproc_newline')
        ),

      preproc_params: ($) => seq(alias($._preproc_lparen, '('), commaSep(choice($.identifier, '...')), ')'),

      preproc_call: ($) =>
        seq(
          field('directive', $.preproc_directive),
          field('argument', optional(alias($._preproc_directive_arg, $.preproc_arg))),
          sym('_preproc_newline')
        ),

      ...preprocIf('', () => sym('_block_item')),
      ...preprocIf('_in_single_case', () => sym('_single_case_body'), 0, true),
      ...preprocIf('_in_field_declaration_list', () => sym('_field_declaration_list_item')),
      ...preprocIf('_in_enumerator_list', () => seq(sym('enumerator'), ',')),
      ...preprocIf('_in_enumerator_list_no_comma', () => sym('enumerator'), -1),

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
        /** @type {[string, number][]} */
        const table = [
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

        return choice(
          ...table.map(([operator, precedence]) => {
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

      // Main Grammar

      function_definition: ($) =>
        seq(
          optional($.ms_call_modifier),
          $._declaration_specifiers,
          optional($.ms_call_modifier),
          field('declarator', $._declarator),
          field('body', $.compound_statement)
        ),

      _old_style_function_definition: ($) =>
        seq(
          optional($.ms_call_modifier),
          $._declaration_specifiers,
          field('declarator', alias($._old_style_function_declarator, $.function_declarator)),
          repeat1($.declaration),
          field('body', $.compound_statement)
        ),

      declaration: ($) =>
        seq(
          choice(
            $._declaration_specifiers,
            prec.dynamic(
              PREC.PAREN_DECLARATOR - 1,
              seq(
                repeat($._declaration_modifiers),
                alias('auto', $.storage_class_specifier),
                repeat($._declaration_modifiers)
              )
            )
          ),
          commaSep1(
            field(
              'declarator',
              choice(
                seq(optional($.ms_call_modifier), $._declaration_declarator, optional($.gnu_asm_expression)),
                $.init_declarator
              )
            )
          ),
          ';'
        ),

      type_definition: ($) =>
        seq(
          optional(prec.dynamic(1, '__extension__')),
          choice(
            seq(repeat($.type_qualifier), 'typedef', $._type_definition_type),
            seq(
              repeat($._declaration_modifiers),
              field('type', $._non_identifier_type_specifier),
              repeat($.type_qualifier),
              'typedef',
              repeat(choice($.type_qualifier, $._non_identifier_type_specifier))
            )
          ),
          $._type_definition_declarators,
          repeat($.attribute_specifier),
          ';'
        ),
      _type_definition_type: ($) =>
        seq(repeat($.type_qualifier), field('type', $.type_specifier), repeat($.type_qualifier)),
      _type_definition_declarators: ($) => commaSep1(field('declarator', $._type_declarator)),

      _declaration_modifiers: ($) =>
        choice(
          $.storage_class_specifier,
          $.type_qualifier,
          $.attribute_specifier,
          $.attribute_declaration,
          $.ms_declspec_modifier
        ),

      _declaration_specifiers: ($) =>
        prec.right(
          seq(repeat($._declaration_modifiers), field('type', $.type_specifier), repeat($._declaration_modifiers))
        ),

      linkage_specification: ($) =>
        seq(
          'extern',
          field('value', $.string_literal),
          field('body', choice($.function_definition, $.declaration, $.declaration_list))
        ),

      attribute_specifier: ($) => seq(choice('__attribute__', '__attribute'), '(', $.argument_list, ')'),

      attribute: ($) =>
        seq(optional(seq(field('prefix', $.identifier), '::')), field('name', $.identifier), optional($.argument_list)),

      attribute_declaration: ($) => seq('[[', commaSep1($.attribute), ']]'),

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

      declaration_list: ($) => seq('{', repeat($._block_item), '}'),

      _declarator: ($) =>
        choice(
          $.attributed_declarator,
          $.pointer_declarator,
          $.function_declarator,
          $.array_declarator,
          $.parenthesized_declarator,
          $.identifier,
          alias(VA_ARG_KEYWORDS, $.identifier)
        ),

      _declaration_declarator: ($) =>
        choice(
          $.attributed_declarator,
          $.pointer_declarator,
          alias($._function_declaration_declarator, $.function_declarator),
          $.array_declarator,
          $.parenthesized_declarator,
          $.identifier,
          alias(VA_ARG_KEYWORDS, $.identifier)
        ),

      _field_declarator: ($) =>
        choice(
          alias($.attributed_field_declarator, $.attributed_declarator),
          alias($.pointer_field_declarator, $.pointer_declarator),
          alias($.function_field_declarator, $.function_declarator),
          alias($.array_field_declarator, $.array_declarator),
          alias($.parenthesized_field_declarator, $.parenthesized_declarator),
          $._field_identifier
        ),

      _type_declarator: ($) =>
        choice(
          alias($.attributed_type_declarator, $.attributed_declarator),
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
        prec.dynamic(PREC.PAREN_DECLARATOR, seq('(', optional($.ms_call_modifier), $._declarator, ')')),
      parenthesized_field_declarator: ($) =>
        prec.dynamic(PREC.PAREN_DECLARATOR, seq('(', optional($.ms_call_modifier), $._field_declarator, ')')),
      parenthesized_type_declarator: ($) =>
        prec.dynamic(PREC.PAREN_DECLARATOR, seq('(', optional($.ms_call_modifier), $._type_declarator, ')')),
      abstract_parenthesized_declarator: ($) =>
        prec(1, seq('(', optional($.ms_call_modifier), $._abstract_declarator, ')')),

      attributed_declarator: ($) => prec.right(seq($._declarator, repeat1($.attribute_declaration))),
      attributed_field_declarator: ($) => prec.right(seq($._field_declarator, repeat1($.attribute_declaration))),
      attributed_type_declarator: ($) => prec.right(seq($._type_declarator, repeat1($.attribute_declaration))),

      pointer_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional($.ms_based_modifier),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(choice($.type_qualifier, $.attribute_specifier)),
              field('declarator', $._declarator)
            )
          )
        ),
      pointer_field_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              optional($.ms_based_modifier),
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(choice($.type_qualifier, $.attribute_specifier)),
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
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(choice($.type_qualifier, $.attribute_specifier)),
              field('declarator', $._type_declarator)
            )
          )
        ),
      abstract_pointer_declarator: ($) =>
        prec.dynamic(
          1,
          prec.right(
            seq(
              '*',
              repeat($.attribute_declaration),
              repeat($.ms_pointer_modifier),
              repeat(choice($.type_qualifier, $.attribute_specifier)),
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
        sizedTypeSpecifier(optional(choice(prec.dynamic(-1, $._type_identifier), $.primitive_type))),

      _sized_bit_int_specifier: ($) => sizedTypeSpecifier($.bit_int_specifier),

      primitive_type: () =>
        token(
          choice(
            'bool',
            'char',
            'int',
            'float',
            'double',
            'void',
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
              seq($.preproc_call, ',')
            )
          ),
          optional(
            seq(
              choice(
                $.enumerator,
                alias(sym('preproc_if_in_enumerator_list_no_comma'), sym('preproc_if')),
                alias(sym('preproc_ifdef_in_enumerator_list_no_comma'), sym('preproc_ifdef')),
                $.preproc_call
              )
            )
          ),
          '}'
        ),

      struct_specifier: ($) =>
        prec.right(
          seq(
            'struct',
            optional($.attribute_specifier),
            optional($.ms_declspec_modifier),
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
            optional($.ms_declspec_modifier),
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
        seq('(', commaSep(choice($.identifier, alias(VA_ARG_KEYWORDS, $.identifier), $.variadic_parameter)), ')'),

      parameter_declaration: ($) =>
        seq(
          $._declaration_specifiers,
          optional(field('declarator', choice($._declarator, $._abstract_declarator))),
          repeat($.attribute_specifier)
        ),

      // Statements

      attributed_statement: ($) => seq(repeat1($.attribute_declaration), $.statement),

      statement: ($) => choice($.case_statement, $._non_case_statement),

      _non_case_statement: ($) =>
        choice(
          $.attributed_statement,
          $.labeled_statement,
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

      labeled_statement: ($) => seq(field('label', $._statement_identifier), ':', choice($.declaration, $.statement)),

      // This is missing binary expressions, others were kept so that macro code can be parsed better and code examples
      _top_level_expression_statement: ($) => seq(optional($._expression_not_binary), ';'),

      expression_statement: ($) => seq(optional(choice($.expression, $.comma_expression)), ';'),

      if_statement: ($) =>
        prec.right(
          seq(
            'if',
            field('condition', $.parenthesized_expression),
            field('consequence', $.statement),
            optional(field('alternative', $.else_clause))
          )
        ),

      else_clause: ($) => seq('else', $.statement),

      switch_statement: ($) =>
        seq('switch', field('condition', $.parenthesized_expression), field('body', $._single_statement)),

      _single_statement: ($) => choice($.compound_statement, alias($._single_noncompound_statement, $.statement)),

      _single_noncompound_statement: ($) =>
        choice(
          $.expression_statement,
          $.switch_statement,
          $.return_statement,
          $.break_statement,
          $.continue_statement,
          $.goto_statement,
          $.seh_try_statement,
          $.seh_leave_statement,
          alias($._single_case_statement, $.case_statement),
          alias($._single_labeled_statement, $.labeled_statement),
          alias($._single_if_statement, $.if_statement),
          alias($._single_while_statement, $.while_statement),
          alias($._single_do_statement, $.do_statement),
          alias($._single_for_statement, $.for_statement),
          alias($._single_attributed_statement, $.attributed_statement)
        ),

      _single_case_statement: ($) =>
        prec.right(
          seq(
            choice(
              seq('case', field('value', $.expression), optional(seq('...', field('end_value', $.expression)))),
              'default'
            ),
            ':',
            optional($._single_case_body)
          )
        ),
      _single_case_body: ($) =>
        choice(
          $._single_statement,
          $.declaration,
          $.type_definition,
          alias(sym('preproc_if_in_single_case'), sym('preproc_if')),
          alias(sym('preproc_ifdef_in_single_case'), sym('preproc_ifdef'))
        ),
      _single_labeled_statement: ($) =>
        seq(field('label', $._statement_identifier), ':', choice($._single_statement, $.declaration)),
      _single_if_statement: ($) =>
        prec.right(
          seq(
            'if',
            field('condition', $.parenthesized_expression),
            field('consequence', $._single_statement),
            optional(field('alternative', alias($._single_else_clause, $.else_clause)))
          )
        ),
      _single_else_clause: ($) => seq('else', $._single_statement),
      _single_while_statement: ($) =>
        seq('while', field('condition', $.parenthesized_expression), field('body', $._single_statement)),
      _single_do_statement: ($) =>
        seq('do', field('body', $._single_statement), 'while', field('condition', $.parenthesized_expression), ';'),
      _single_for_statement: ($) => seq('for', '(', $._for_statement_body, ')', field('body', $._single_statement)),
      _single_attributed_statement: ($) => seq(repeat1($.attribute_declaration), $._single_statement),

      case_statement: ($) =>
        prec.right(
          seq(
            choice(
              seq('case', field('value', $.expression), optional(seq('...', field('end_value', $.expression)))),
              'default'
            ),
            ':',
            repeat(choice($._non_case_statement, $.declaration, $.type_definition))
          )
        ),

      while_statement: ($) => seq('while', field('condition', $.parenthesized_expression), field('body', $.statement)),

      do_statement: ($) =>
        seq('do', field('body', $.statement), 'while', field('condition', $.parenthesized_expression), ';'),

      for_statement: ($) => seq('for', '(', $._for_statement_body, ')', field('body', $.statement)),
      _for_statement_body: ($) =>
        seq(
          choice(
            field('initializer', $.declaration),
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

      // Expressions

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
        /** @type {[string, number][]} */
        const table = [
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

        return choice(
          ...table.map(([operator, precedence]) => {
            return prec.left(
              precedence,
              seq(field('left', $.expression), field('operator', operator), field('right', $.expression))
            );
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
            seq('sizeof', choice(field('value', $.expression), seq('(', field('type', $.type_descriptor), ')')))
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

      // The compound_statement is added to parse macros taking statements as arguments, e.g. MYFORLOOP(1, 10, i, { foo(i); bar(i); })
      argument_list: ($) => seq('(', commaSep(choice($.expression, $.compound_statement)), ')'),

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
          alias($._initializer_preproc_call, $.preproc_call)
        ),

      _initializer_element: ($) => choice($.initializer_pair, $.expression, $.initializer_list),

      _initializer_branch: ($) => choice(seq(',', optional($._initializer_sequence)), $._initializer_sequence),

      _initializer_preproc_call: ($) =>
        seq(
          field(
            'directive',
            alias(token(/#[ \t]*(embed|include|undef|error|warning|line|pragma)/), $.preproc_directive)
          ),
          field('argument', optional(alias($._preproc_directive_arg, $.preproc_arg))),
          alias(sym('_preproc_newline'), '\n')
        ),

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
            optional(choice(/0[xX]/, /0[bB]/)),
            choice(
              seq(
                choice(decimalDigits, seq(/0[bB]/, decimalDigits), seq(/0[xX]/, hexDigits)),
                optional(seq('.', optional(hexDigits)))
              ),
              seq('.', decimalDigits)
            ),
            optional(seq(/[eEpP]/, optional(seq(optional(/[-+]/), hexDigits)))),
            /[uUlLwWfFbBdD]*/
          )
        );
      },

      char_literal: ($) =>
        seq(
          choice("L'", "u'", "U'", "u8'", "'"),
          repeat1(choice($.escape_sequence, alias(token.immediate(/[^\n']/), sym('character')))),
          "'"
        ),

      // Must concatenate at least 2 nodes, one of which must be a string_literal.
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
          repeat(choice(alias(token.immediate(prec(1, /[^\\"\n]+/)), sym('string_content')), $.escape_sequence)),
          '"'
        ),

      escape_sequence: () =>
        token(
          prec(
            1,
            seq(
              '\\',
              choice(
                /[^xuU]/,
                /[xu]\{[0-9a-fA-F]+\}/,
                /o\{[0-7]+\}/,
                /N\{[^}\n]+\}/,
                /\d{2,3}/,
                /x[0-9a-fA-F]{1,4}/,
                /u[0-9a-fA-F]{4}/,
                /U[0-9a-fA-F]{8}/
              )
            )
          )
        ),

      system_lib_string: () => token(seq('<', repeat(choice(/[^>\n]/, String.raw`\>`)), '>')),

      true: () => token(choice('TRUE', 'true')),
      false: () => token(choice('FALSE', 'false')),
      null: () => choice('NULL', 'nullptr'),

      identifier: () =>
        /(\p{XID_Start}|\$|_|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})(\p{XID_Continue}|\$|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})*/u,
      _type_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('type_identifier')),
      _field_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('field_identifier')),
      _statement_identifier: ($) => alias(choice($.identifier, VA_ARG_KEYWORDS), sym('statement_identifier')),

      _empty_declaration: ($) => seq(repeat($.ms_declspec_modifier), $.type_specifier, ';'),

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

      // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
      comment: () => token(choice(LINE_COMMENT, seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
    },
  }),
  { PREC, preprocIf, preprocessor, commaSep, commaSep1 }
);

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
      suffix ? alias(sym('preproc_else' + suffix), sym('preproc_else')) : sym('preproc_else'),
      suffix ? alias(sym('preproc_elif' + suffix), sym('preproc_elif')) : sym('preproc_elif'),
      suffix ? alias(sym('preproc_elifdef' + suffix), sym('preproc_elifdef')) : sym('preproc_elifdef')
    );
  }

  return {
    ['preproc_if' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          preprocessor('if'),
          field('condition', sym('_preproc_expression')),
          alias(sym('_preproc_newline'), '\n'),
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
          alias(sym('_preproc_newline'), '\n'),
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
