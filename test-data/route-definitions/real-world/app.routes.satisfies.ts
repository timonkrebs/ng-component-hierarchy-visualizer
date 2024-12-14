import { Routes } from "@angular/router";
import { inject } from "@angular/core";
import { UserService } from "./core/auth/services/user.service";
import { map } from "rxjs/operators";
import { ProfileComponent } from "./features/profile/pages/profile/profile.component";

export const routes = [
  {
    path: "",
    loadComponent: () => import("./features/article/pages/home/home.component"),
  },
  {
    path: "login",
    loadComponent: () => false 
    ? import("./core/auth/auth.component")
    : import("./uups"),
    canActivate: [
      () => inject(UserService).isAuthenticated.pipe(map((isAuth) => !isAuth)),
    ],
  },
  {
    path: "register",
    loadComponent: true? () => import("./core/auth/auth.component") : import("./noooo"),
    canActivate: [
      () => inject(UserService).isAuthenticated.pipe(map((isAuth) => !isAuth)),
    ],
  },
  {
    path: "settings",
    loadComponent: () => import("./features/settings/settings.component").then(c => c.SettingsComponent),
    canActivate: [() => inject(UserService).isAuthenticated],
  },
  {
    path: "profile",
    loadChildren: () => import("./features/profile/profile.routes")
  },
  {
    path: "editor",
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/article/pages/editor/editor.component"),
        canActivate: [() => inject(UserService).isAuthenticated],
      },
      {
        path: ":slug",
        loadComponent: () =>
          import("./features/article/pages/editor/editor.component"),
        canActivate: [() => inject(UserService).isAuthenticated],
      },
    ],
  },
  {
    path: "article/:slug",
    loadComponent: () =>
      import("./features/article/pages/article/article.component"),
  },
] satisfies Routes;
