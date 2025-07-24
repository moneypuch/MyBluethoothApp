// app/models/RootStore.ts
import { Instance, SnapshotOut, types } from "mobx-state-tree"
import { AuthenticationStoreModel } from "./AuthenticationStore" // Your existing stores
import { BluetoothStoreLiteModel } from "./BluetoothStoreLite" // Lightweight Bluetooth store

/**
 * A RootStore model.
 */
export const RootStoreModel = types.model("RootStore").props({
  authenticationStore: types.optional(AuthenticationStoreModel, {}),
  bluetoothStore: types.optional(BluetoothStoreLiteModel, {}), // Lightweight Bluetooth store
})

/**
 * The RootStore instance.
 */
export interface RootStore extends Instance<typeof RootStoreModel> {}
/**
 * The data of a RootStore.
 */
export interface RootStoreSnapshot extends SnapshotOut<typeof RootStoreModel> {}
