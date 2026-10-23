// 레시피 명령의 첫 import 로 둔다. 실패하면 Node 스택 대신 이유와 다음 할 일을 찍는다(recipe-errors.ts).
import { RPC } from "./maroo.ts";
import { installRecipeErrors } from "./recipe-errors.ts";

installRecipeErrors({ rpc: RPC });
