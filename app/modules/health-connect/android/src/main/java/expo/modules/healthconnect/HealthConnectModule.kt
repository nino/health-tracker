package expo.modules.healthconnect

import androidx.health.connect.client.HealthConnectClient
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HealthConnectModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HealthConnect")

    // HealthConnectClient.SDK_AVAILABLE / SDK_UNAVAILABLE /
    // SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
    Function("getSdkStatus") {
      val context = appContext.reactContext
        ?: return@Function HealthConnectClient.SDK_UNAVAILABLE
      HealthConnectClient.getSdkStatus(context)
    }
  }
}
