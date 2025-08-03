import { Instance, SnapshotOut, types } from "mobx-state-tree"

export const AuthenticationStoreModel = types
  .model("AuthenticationStore")
  .props({
    authToken: types.maybe(types.string),
    authEmail: "",
    userRole: types.optional(types.enumeration("UserRole", ["user", "admin"]), "user"),
    userName: types.maybe(types.string),
    userId: types.maybe(types.string),
  })
  .views((store) => ({
    get isAuthenticated() {
      return !!store.authToken
    },
    get isAdmin() {
      return store.userRole === "admin"
    },
    get validationError() {
      if (store.authEmail.length === 0) return "can't be blank"
      if (store.authEmail.length < 6) return "must be at least 6 characters"
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.authEmail))
        return "must be a valid email address"
      return ""
    },
  }))
  .actions((store) => ({
    setAuthToken(value?: string) {
      store.authToken = value
    },
    setAuthEmail(value: string) {
      store.authEmail = value.replace(/ /g, "")
    },
    setUserInfo(user: { id: string; name: string; role: "user" | "admin" }) {
      store.userId = user.id
      store.userName = user.name
      store.userRole = user.role
    },
    logout() {
      store.authToken = undefined
      store.authEmail = ""
      store.userRole = "user"
      store.userName = undefined
      store.userId = undefined

      // Remove token from API client
      const { api } = require("@/services/api")
      api.removeAuthToken()
    },
  }))

export interface AuthenticationStore extends Instance<typeof AuthenticationStoreModel> {}
export interface AuthenticationStoreSnapshot extends SnapshotOut<typeof AuthenticationStoreModel> {}
