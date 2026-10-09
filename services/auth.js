export const authService = Object.freeze({

    isAvailable() {
        return Boolean(
            window.puter &&
            window.puter.auth
        );
    },

    isSignedIn() {
        try {
            return Boolean(
                this.isAvailable() &&
                typeof window.puter.auth.isSignedIn === "function" &&
                window.puter.auth.isSignedIn()
            );
        } catch (error) {
            console.error("[TheDivineX Auth] isSignedIn error:", error);
            return false;
        }
    },

    async signIn() {

        console.log("[TheDivineX Auth] signIn() started");
        console.log("[TheDivineX Auth] Origin:", window.location.origin);
        console.log("[TheDivineX Auth] URL:", window.location.href);

        if (!this.isAvailable()) {
            const error = new Error(
                "Puter authentication is not available. Puter.js may not have loaded."
            );

            error.code = "PUTER_UNAVAILABLE";

            console.error(
                "[TheDivineX Auth] Puter unavailable:",
                error
            );

            throw error;
        }

        if (this.isSignedIn()) {
            console.log("[TheDivineX Auth] Already signed in.");
            return true;
        }

        if (
            typeof window.puter.auth.signIn !== "function"
        ) {
            const error = new Error(
                "puter.auth.signIn() is not available."
            );

            error.code = "SIGNIN_METHOD_UNAVAILABLE";

            console.error(
                "[TheDivineX Auth] signIn method unavailable:",
                error
            );

            throw error;
        }

        try {

            console.log(
                "[TheDivineX Auth] Opening Puter authentication..."
            );

            const result =
                await window.puter.auth.signIn();

            console.log(
                "[TheDivineX Auth] Raw signIn result:",
                result
            );

            if (
                result &&
                result.success === false
            ) {
                const error = new Error(
                    result.msg ||
                    result.error ||
                    "Puter authentication failed."
                );

                error.code =
                    result.error ||
                    "AUTH_FAILED";

                error.puterResult = result;

                console.error(
                    "[TheDivineX Auth] Puter returned failure:",
                    error
                );

                throw error;
            }

            console.log(
                "[TheDivineX Auth] Authentication successful."
            );

            return true;

        } catch (error) {

            console.error(
                "[TheDivineX Auth] SIGN IN FAILED",
                {
                    code: error?.code,
                    message: error?.message,
                    msg: error?.msg,
                    error: error?.error,
                    result: error
                }
            );

            throw error;
        }
    },

    async signOut() {

        if (
            this.isAvailable() &&
            typeof window.puter.auth.signOut === "function"
        ) {
            await window.puter.auth.signOut();
        }

        return true;
    },

    async getUser() {

        if (
            !this.isAvailable() ||
            typeof window.puter.auth.getUser !== "function"
        ) {
            return null;
        }

        try {
            return await window.puter.auth.getUser();
        } catch (error) {
            console.error(
                "[TheDivineX Auth] getUser failed:",
                error
            );

            return null;
        }
    }

});
