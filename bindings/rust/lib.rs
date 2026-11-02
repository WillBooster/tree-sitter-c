//! This crate provides C language support for the [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = "int main(void) {\n    return 0;\n}\n";
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_c::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading C parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! The parser uses the ABI of the WillBooster/tree-sitter generator. Use the matching
//! `willbooster-tree-sitter` runtime, pinned to 16.0.0 for this crate's tests; other tree-sitter runtimes reject it.
//!
//! [`Parser`]: https://docs.rs/willbooster-tree-sitter/16.0.0/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_c() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_c) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading C parser");
    }

    #[test]
    fn odd_utf16_input_reports_an_error_without_crashing() {
        for prefix in ["int value;\n", "/* λ */\nint value;\n"] {
            let mut source: Vec<u8> = prefix.encode_utf16().flat_map(u16::to_le_bytes).collect();
            source.push(b'#');
            unsafe {
                let parser = tree_sitter::ffi::ts_parser_new();
                assert!(tree_sitter::ffi::ts_parser_set_language(
                    parser,
                    super::tree_sitter_c().cast()
                ));
                let tree = tree_sitter::ffi::ts_parser_parse_string_encoding(
                    parser,
                    std::ptr::null(),
                    source.as_ptr().cast(),
                    source.len() as u32,
                    tree_sitter::ffi::TSInputEncodingUTF16LE,
                );
                assert!(!tree.is_null());
                let root = tree_sitter::ffi::ts_tree_root_node(tree);
                assert!(tree_sitter::ffi::ts_node_has_error(root));
                assert_eq!(
                    tree_sitter::ffi::ts_node_end_byte(root),
                    source.len() as u32
                );
                tree_sitter::ffi::ts_tree_delete(tree);
                tree_sitter::ffi::ts_parser_delete(parser);
            }
        }
    }

    #[test]
    fn invalid_utf8_in_strings_preserves_following_directives() {
        let source =
            b"char *s = \"caf\xe9 /*\";\n#define VALUE 1\nint following = VALUE;\n/* end */\n";
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        let tree = parser.parse(source, None).unwrap();
        assert_definition(&tree, source, b"char *s = \"caf\xe9 /*\";\n".len());
        assert_eq!(
            tree.root_node().named_child(2).unwrap().kind(),
            "declaration"
        );
    }

    #[test]
    fn included_range_gaps_preserve_directive_positions() {
        for gap in ["x", "xx", "<%XXXXXXXX%>", "λ𐐀"] {
            let source = format!("int before;\n{gap}\n#define VALUE 1\nint following = VALUE;\n");
            let first_end = "int before;\n".len();
            let second_start = first_end + gap.len() + 1;
            let mut parser = tree_sitter::Parser::new();
            parser.set_language(&super::LANGUAGE.into()).unwrap();
            parser
                .set_included_ranges(&[
                    tree_sitter::Range {
                        start_byte: 0,
                        end_byte: first_end,
                        start_point: tree_sitter::Point::new(0, 0),
                        end_point: tree_sitter::Point::new(1, 0),
                    },
                    tree_sitter::Range {
                        start_byte: second_start,
                        end_byte: source.len(),
                        start_point: tree_sitter::Point::new(2, 0),
                        end_point: tree_sitter::Point::new(4, 0),
                    },
                ])
                .unwrap();
            let tree = parser.parse(&source, None).unwrap();
            assert_definition(&tree, source.as_bytes(), second_start);
        }
    }

    #[test]
    fn custom_latin1_decoder_preserves_directive_positions() {
        struct Latin1;
        impl tree_sitter::Decode for Latin1 {
            fn decode(bytes: &[u8]) -> (i32, u32) {
                (i32::from(bytes[0]), 1)
            }
        }
        let source = b"/* caf\xe9 */\n#define VALUE 1\nint following = VALUE;\n";
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        let tree = parser
            .parse_custom_encoding::<Latin1, _, _>(&mut |byte, _| &source[byte..], None, None)
            .unwrap();
        assert_definition(&tree, source, b"/* caf\xe9 */\n".len());
    }

    fn assert_definition(tree: &tree_sitter::Tree, source: &[u8], start: usize) {
        let root = tree.root_node();
        assert!(!root.has_error(), "{}", root.to_sexp());
        assert_eq!(root.end_byte(), source.len());
        let mut cursor = root.walk();
        let definition = root
            .named_children(&mut cursor)
            .find(|node| node.kind() == "preproc_def")
            .unwrap();
        assert_eq!(definition.start_byte(), start);
        assert_eq!(
            definition
                .child_by_field_name("name")
                .unwrap()
                .utf8_text(source)
                .unwrap(),
            "VALUE"
        );
    }
}
