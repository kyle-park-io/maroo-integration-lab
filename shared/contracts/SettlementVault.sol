// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// 구매 기업이 협력사별 대금을 OKRW로 넣어 두고, 협력사가 직접 청구해 받는 정산 금고.
///
/// PCL 프록시(deployPclProxy) 뒤에 두고 claim() 선택자에만 KYB 증명 정책(EAS_POLICY)을 건다.
/// PCL은 호출하는 쪽을 평가하므로, 청구하는 협력사(msg.sender)의 증명이 확인된다.
///
/// PCL 프록시는 Transparent, UUPS, Beacon 세 종류라 항상 업그레이드할 수 있다. 그래서 상태는
/// 생성자가 아닌 initialize()에서 채우고, 구현 컨트랙트는 생성자에서 초기화를 막는다.
/// 업그레이드 권한(프록시 소유자)과 PCL 정책 관리 권한은 배포할 때 서로 다른 주소에 둔다.
///
/// 상태는 ERC-7201 네임스페이스 슬롯에 둔다(Solidity 0.8.35 이상의 layout at erc7201).
/// 이 지정자가 붙은 컨트랙트는 상속할 수 없으므로, 로직을 바꿀 때는 새 버전을 따로 작성한다.
contract SettlementVault layout at erc7201("maroo-integration-lab.SettlementVault") is Initializable {
    address public buyer;
    mapping(address => uint256) public owed;

    event Funded(address indexed supplier, uint256 amount);
    event Claimed(address indexed supplier, uint256 amount);
    event Recalled(address indexed supplier, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error NotBuyer();
    error NothingOwed();
    error TransferFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address buyer_) external initializer {
        if (buyer_ == address(0)) revert ZeroAddress();
        buyer = buyer_;
    }

    /// 구매 기업이 협력사 몫의 대금을 넣는다. 보낸 OKRW(msg.value)가 그대로 그 협력사 몫이 된다.
    function fund(address supplier) external payable {
        if (msg.sender != buyer) revert NotBuyer();
        if (supplier == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        owed[supplier] += msg.value;
        emit Funded(supplier, msg.value);
    }

    /// 협력사가 자기 몫을 한 번에 받는다. PCL 정책이 이 호출에 걸린다.
    function claim() external {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        emit Claimed(msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// 구매 기업이 아직 청구되지 않은 협력사 몫을 되돌려 받는다.
    /// 협력사의 KYB 증명이 폐기돼 청구할 수 없게 된 몫이 금고에 갇히지 않게 한다.
    function recall(address supplier) external {
        if (msg.sender != buyer) revert NotBuyer();
        uint256 amount = owed[supplier];
        if (amount == 0) revert NothingOwed();
        owed[supplier] = 0;
        emit Recalled(supplier, amount);
        _send(buyer, amount);
    }

    /// 네이티브 OKRW를 보낸다. 받는 쪽이 컨트랙트일 수 있어 transfer 대신 call을 쓴다.
    /// 받는 주소는 claim()의 msg.sender 와 recall()의 buyer 두 곳에서만 정해진다.
    function _send(address to, uint256 amount) private {
        // forge-lint: disable-next-line(low-level-calls, arbitrary-send-eth)
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
