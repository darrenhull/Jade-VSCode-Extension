'use strict';
/** Match native UTF8/UTF16 BOM source text without opening a TextDocument. */
function decodeSourceBytes(value){const bytes=Buffer.from(value);const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';return new TextDecoder(encoding).decode(bytes);}
module.exports={decodeSourceBytes};