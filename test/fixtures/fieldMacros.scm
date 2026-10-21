(struct_specifier name: (type_identifier) @structure)
(type_definition declarator: (type_identifier) @type)
(preproc_ifdef) @conditional
(preproc_if) @branch
(macro_specifier name: (identifier) @marker)
(function_definition declarator: (function_declarator declarator: (identifier) @function))
(ERROR) @error
(function_declarator declarator: (identifier) @declarator)
