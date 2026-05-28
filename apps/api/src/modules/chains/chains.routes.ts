import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { ChainsController } from "./chains.controller.js";
import { ChainExplorerController } from "./explorer.controller.js";
import { chainParams, createRpcEndpointBody, listChainsQuery, orgChainParams, validateAddressQuery } from "./chains.schemas.js";
import { chainAddressParams, fetchExplorerSourceBody, scanExplorerSourceBody, verificationQuery } from "./explorer.schemas.js";

const controller = new ChainsController();
const explorerController = new ChainExplorerController();

export const chainsRoutes = Router();
chainsRoutes.use(authenticateJwtOrApiKey);

chainsRoutes.get(
  "/chains",
  validateRequest({ query: listChainsQuery }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.list)
);

chainsRoutes.get(
  "/chains/:chainId",
  validateRequest({ params: chainParams }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.get)
);

chainsRoutes.get(
  "/chains/:chainId/explorers",
  validateRequest({ params: chainParams }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.explorers)
);

chainsRoutes.get(
  "/chains/:chainId/features",
  validateRequest({ params: chainParams }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.features)
);

chainsRoutes.get(
  "/chains/:chainId/rpc-endpoints",
  validateRequest({ params: chainParams }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.rpcEndpoints)
);

chainsRoutes.get(
  "/chains/:chainId/address/validate",
  validateRequest({ params: chainParams, query: validateAddressQuery }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.validateAddress)
);



chainsRoutes.get(
  "/chains/:chainId/contracts/:address/verification",
  validateRequest({ params: chainAddressParams, query: verificationQuery }),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(explorerController.verification)
);

chainsRoutes.post(
  "/chains/:chainId/contracts/:address/fetch-source",
  validateRequest({ params: chainAddressParams, body: fetchExplorerSourceBody }),
  requireOrganizationParam("organizationId"),
  requirePermissions("scans:create"),
  asyncHandler(explorerController.fetchSource)
);

chainsRoutes.post(
  "/chains/:chainId/contracts/:address/scan",
  validateRequest({ params: chainAddressParams, body: scanExplorerSourceBody }),
  requireOrganizationParam("organizationId"),
  requirePermissions("scans:create"),
  asyncHandler(explorerController.scan)
);

chainsRoutes.post(
  "/orgs/:orgId/chains/:chainId/rpc-endpoints",
  validateRequest({ params: orgChainParams, body: createRpcEndpointBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.createRpcEndpoint)
);
