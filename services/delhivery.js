/**
 * Backward compatibility facade. Re-exports the production Delhivery service layer.
 */
export * from "./delhivery.service.js";
import delhiveryService from "./delhivery.service.js";
export default delhiveryService;
