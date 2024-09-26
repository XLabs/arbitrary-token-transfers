// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

function transferTokens(address token, address to, uint256 amount) internal {
  if (token == address(0))
    _transferEth(to, amount);
  else
    IERC20(token).safeTransfer(to, amount);
}