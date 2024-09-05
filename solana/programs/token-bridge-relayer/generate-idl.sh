TARGET='../../../target/idl'

mkdir -p $TARGET
anchor idl build --skip-lint --out $TARGET/token-bridge-relayer.json --out-ts $TARGET/token-bridge-relayer.ts
