export type SuiAddress = string
export type SuiObjectId = string
export type SuiPackageId = SuiObjectId
export type SuiType = string
export type ChainId = number

export type SuiObject = {
    objectId: SuiObjectId,
    version: string,
    digest: string,
    type: SuiType
}