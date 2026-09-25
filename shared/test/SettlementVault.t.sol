// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SettlementVault} from "../contracts/SettlementVault.sol";

/// 금고 규칙만 로컬 EVM에서 검사한다. PCL 프리컴파일은 로컬 EVM에 없으므로
/// claim()의 KYB 관문은 여기서 검사하지 않는다. 그 부분은 테스트넷 레시피(pnpm a:kyb-gate)가 확인한다.
contract SettlementVaultTest is Test {
    SettlementVault vault;
    address buyer = makeAddr("buyer");
    address supplierA = makeAddr("supplierA");
    address outsider = makeAddr("outsider");
    uint256 constant SHARE = 100 ether;
    uint256 constant SMALL = 1 ether;

    function setUp() public {
        SettlementVault impl = new SettlementVault();
        // PCL 프록시처럼 프록시 뒤에서 initialize()로 상태를 채운다.
        vault = SettlementVault(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(SettlementVault.initialize, (buyer))))
        );
        vm.deal(buyer, 1_000 ether);
    }

    function test_StateLivesInErc7201Namespace() public view {
        // buyer 는 네임스페이스 첫 슬롯, owed 매핑은 그다음 슬롯에 있다.
        bytes32 base = bytes32(erc7201("maroo-integration-lab.SettlementVault"));
        assertEq(address(uint160(uint256(vm.load(address(vault), base)))), buyer);
        assertEq(vm.load(address(vault), bytes32(0)), bytes32(0));
    }

    function test_ImplementationCannotBeInitialized() public {
        SettlementVault impl = new SettlementVault();
        vm.expectRevert();
        impl.initialize(buyer);
    }

    function test_OnlyBuyerFunds() public {
        vm.deal(outsider, SMALL);
        vm.prank(outsider);
        vm.expectRevert(SettlementVault.NotBuyer.selector);
        vault.fund{value: SMALL}(supplierA);
    }

    function test_FundRejectsZeroSupplierAndZeroAmount() public {
        vm.startPrank(buyer);
        vm.expectRevert(SettlementVault.ZeroAddress.selector);
        vault.fund{value: SMALL}(address(0));
        vm.expectRevert(SettlementVault.ZeroAmount.selector);
        vault.fund(supplierA);
        vm.stopPrank();
    }

    function test_ClaimPaysOnceAndEmits() public {
        vm.prank(buyer);
        vault.fund{value: SHARE}(supplierA);

        vm.expectEmit(true, false, false, true, address(vault));
        emit SettlementVault.Claimed(supplierA, SHARE);
        vm.prank(supplierA);
        vault.claim();
        assertEq(supplierA.balance, SHARE);
        assertEq(vault.owed(supplierA), 0);

        vm.prank(supplierA);
        vm.expectRevert(SettlementVault.NothingOwed.selector);
        vault.claim();
    }

    function test_BuyerRecallsUnclaimedShare() public {
        vm.prank(buyer);
        vault.fund{value: SHARE}(supplierA);
        uint256 before = buyer.balance;

        vm.prank(outsider);
        vm.expectRevert(SettlementVault.NotBuyer.selector);
        vault.recall(supplierA);

        vm.prank(buyer);
        vault.recall(supplierA);
        assertEq(buyer.balance, before + SHARE);
        assertEq(vault.owed(supplierA), 0);

        vm.prank(supplierA);
        vm.expectRevert(SettlementVault.NothingOwed.selector);
        vault.claim();
    }
}
