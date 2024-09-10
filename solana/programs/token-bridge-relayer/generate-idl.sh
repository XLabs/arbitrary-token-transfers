TARGET='../../../target'
NAME='token_bridge_relayer'

mkdir -p $TARGET/idl
mkdir -p $TARGET/types

anchor idl build --skip-lint \
    --out $TARGET/idl/$NAME.json \
    --out-ts $TARGET/types/$NAME.ts
