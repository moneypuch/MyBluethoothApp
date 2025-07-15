// app/models/RootStore.ts
import { Instance, SnapshotOut, types } from "mobx-state-tree"
import { AuthenticationStoreModel } from "./AuthenticationStore" // Your existing stores
import { EpisodeStoreModel } from "./EpisodeStore" // Your existing stores
import { BluetoothStoreModel } from "./BluetoothStore" // New Bluetooth store

/**
 * A RootStore model.
 */
export const RootStoreModel = types.model("RootStore").props({
  authenticationStore: types.optional(AuthenticationStoreModel, {}),
  episodeStore: types.optional(EpisodeStoreModel, {}),
  bluetoothStore: types.optional(BluetoothStoreModel, {}), // Add Bluetooth store
})

/**
 * The RootStore instance.
 */
export interface RootStore extends Instance<typeof RootStoreModel> {}
/**
 * The data of a RootStore.
 */
export interface RootStoreSnapshot extends SnapshotOut<typeof RootStoreModel> {}
